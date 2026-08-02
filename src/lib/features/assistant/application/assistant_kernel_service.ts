import {
  humanize_ai_error,
  provider_supports_streaming,
} from "$lib/features/ai";
import { resolve_assistant_provider } from "$lib/features/assistant/domain/resolve_assistant_provider";
import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { AssistantRunStore } from "$lib/features/assistant/state/assistant_run_store.svelte";
import type {
  AssistantProviderProbePort,
  AssistantTransportPort,
} from "$lib/features/assistant/ports";
import { ABORTED_ERROR } from "$lib/features/assistant/types/run";
import type {
  AssistantUserError,
  RunEvent,
  RunHandle,
  RunId,
  RunOutcome,
  RunSink,
  RunSpec,
} from "$lib/features/assistant/types/run";

export type AssistantKernelDeps = {
  transport: AssistantTransportPort;
  probe: AssistantProviderProbePort;
  run_store: AssistantRunStore;
  vault_path: () => string | null;
  providers: () => AiProviderConfig[];
  default_provider_id: () => string;
};

const log = create_logger("assistant_kernel");

const NO_PROVIDER: AssistantUserError = {
  message:
    "No AI provider is available — configure one in Settings, then try again.",
  detail: "The run was not started: no provider resolved.",
};

const NO_VAULT: AssistantUserError = {
  message: "Agent runs need an open vault — open a vault, then try again.",
  detail: "The run was not started: agent mode requires a vault path.",
};

// A provider that cannot stream runs one-shot against a note file, so it needs
// somewhere to write. Refused here rather than at the process boundary, because
// the humanizer only recognises provider text and would launder a synthetic
// message into its generic fallback.
const NO_BLOCKING_TARGET: AssistantUserError = {
  message:
    "This provider can only answer against a saved note — open a note in a vault, then try again.",
  detail:
    "The run was not started: a non-streaming provider runs one-shot against a note file and needs both a vault path and a note path.",
};

// I1: every AI execution is a kernel run. This is the only place in the app
// that owns an AbortController for AI work, the only `for await` consumer of
// the transport, and the only error-humanization choke point.
//
// R8: sinks are injected rather than hard-wired, so Wave 1 can retarget where
// run events land (RagStore today, the unified session store next) without
// editing the runners again.
export class AssistantKernelService {
  private readonly controllers = new Map<RunId, AbortController>();
  private sinks: RunSink[] = [];
  private next_run_number = 0;

  constructor(private readonly deps: AssistantKernelDeps) {}

  // Contract item (b): the id, the record and the abort controller all exist
  // before anything is awaited, so a run is stoppable from the instant it
  // exists. Resolution and every refusal settle through `outcome`.
  // eslint-disable-next-line @typescript-eslint/require-await
  async start(spec: RunSpec, sink?: RunSink): Promise<RunHandle> {
    const id = this.mint_id();
    const controller = new AbortController();
    this.controllers.set(id, controller);
    this.deps.run_store.start(id, spec, Date.now());

    return {
      id,
      stop: () => {
        this.stop(id);
      },
      outcome: this.launch(id, spec, controller.signal, sink),
    };
  }

  private async launch(
    id: RunId,
    spec: RunSpec,
    signal: AbortSignal,
    sink?: RunSink,
  ): Promise<RunOutcome> {
    const provider = spec.provider ?? (await this.resolve_provider());

    // Stopped while the provider was resolving: the transport is never called.
    if (signal.aborted) {
      return this.settle(
        id,
        { status: "aborted", text: this.deps.run_store.text_of(id) },
        sink,
      );
    }

    if (!provider) return this.refuse(id, NO_PROVIDER, sink);
    this.deps.run_store.set_provider(id, provider.id);

    const vault_path = this.deps.vault_path();

    // The transport takes vault_path nullable because a text run legitimately
    // has none. An agent run without one is unrunnable, so it fails here rather
    // than at the process boundary.
    if (spec.request.mode === "agent" && vault_path === null) {
      return this.refuse(id, NO_VAULT, sink);
    }

    if (
      spec.request.mode === "text" &&
      !provider_supports_streaming(provider) &&
      (vault_path === null || !spec.request.note_path)
    ) {
      return this.refuse(id, NO_BLOCKING_TARGET, sink);
    }

    return this.consume(id, spec, provider, vault_path, signal, sink);
  }

  stop(id: RunId): void {
    const controller = this.controllers.get(id);
    if (!controller) return;
    this.controllers.delete(id);
    controller.abort();
    this.deps.run_store.set_status(id, "aborted");
  }

  stop_all(): void {
    for (const id of [...this.controllers.keys()]) this.stop(id);
  }

  is_running(id: RunId): boolean {
    const status = this.deps.run_store.get(id)?.status;
    return status === "starting" || status === "streaming";
  }

  // I2: unsubscribing detaches a listener. It never cancels a run — surfaces
  // come and go while the work they started keeps streaming.
  register_sink(sink: RunSink): () => void {
    this.sinks = [...this.sinks, sink];
    return () => {
      this.sinks = this.sinks.filter((registered) => registered !== sink);
    };
  }

  async resolve_provider(
    requested_id?: string,
  ): Promise<AiProviderConfig | null> {
    const resolution = await resolve_assistant_provider({
      providers: this.deps.providers(),
      requested_id: requested_id ?? this.deps.default_provider_id(),
      detect_status: (config) => this.deps.probe.detect_status(config),
    });
    return resolution.status === "resolved" ? resolution.provider : null;
  }

  private mint_id(): RunId {
    this.next_run_number += 1;
    return `run-${String(this.next_run_number)}`;
  }

  private async consume(
    id: RunId,
    spec: RunSpec,
    provider: AiProviderConfig,
    vault_path: string | null,
    signal: AbortSignal,
    sink?: RunSink,
  ): Promise<RunOutcome> {
    return this.settle(
      id,
      await this.drain(id, spec, provider, vault_path, signal, sink),
      sink,
    );
  }

  // A transport stream has a single consumer slot, so this loop is its only
  // reader. Everything else is fanned out from here, never by re-iterating.
  private async drain(
    id: RunId,
    spec: RunSpec,
    provider: AiProviderConfig,
    vault_path: string | null,
    signal: AbortSignal,
    sink?: RunSink,
  ): Promise<RunOutcome> {
    const runs = this.deps.run_store;

    try {
      for await (const event of this.deps.transport.stream({
        provider_config: provider,
        request: spec.request,
        vault_path,
        signal,
      })) {
        if (signal.aborted) break;

        if (event.type === "error") {
          // The sentinel is a cancellation ack. It arrives whether or not the
          // stop came from us, so the outcome cannot be read off our own
          // signal — reporting "done" here is how an abort reads as success.
          if (event.message === ABORTED_ERROR) {
            runs.set_status(id, "aborted");
            return { status: "aborted", text: runs.text_of(id) };
          }
          return this.fail(
            id,
            humanize_ai_error(event.message, provider),
            sink,
          );
        }

        this.dispatch(id, event, sink);

        if (event.type === "done") {
          return {
            status: "done",
            text: runs.text_of(id),
            stats: event.stats ?? null,
          };
        }
      }
    } catch (thrown) {
      const error = humanize_ai_error(error_message(thrown), provider);
      return this.fail(id, error, sink);
    }

    if (signal.aborted) return { status: "aborted", text: runs.text_of(id) };

    runs.set_status(id, "done");
    return { status: "done", text: runs.text_of(id), stats: null };
  }

  private fail(
    id: RunId,
    error: AssistantUserError,
    sink?: RunSink,
  ): RunOutcome {
    this.deps.run_store.set_error(id, error);
    this.notify(id, { type: "error", message: error.message }, sink);
    return { status: "error", error, text: this.deps.run_store.text_of(id) };
  }

  // A refusal never reaches `consume`, so it settles its own outcome.
  private refuse(
    id: RunId,
    error: AssistantUserError,
    sink?: RunSink,
  ): RunOutcome {
    return this.settle(id, this.fail(id, error, sink), sink);
  }

  // The abort path breaks the consumer loop without a terminal event, so a sink
  // holding transcript state learns the run ended only from here. Every
  // terminal path runs through this, which makes it the one place the run's
  // controller can be released.
  private settle(id: RunId, outcome: RunOutcome, sink?: RunSink): RunOutcome {
    this.controllers.delete(id);
    if (sink) this.close(sink, id, outcome);
    for (const registered of this.sinks) this.close(registered, id, outcome);
    return outcome;
  }

  private dispatch(id: RunId, event: RunEvent, sink?: RunSink): void {
    this.deps.run_store.apply_event(id, event);
    this.notify(id, event, sink);
  }

  private notify(id: RunId, event: RunEvent, sink?: RunSink): void {
    if (sink) this.deliver(sink, id, event);
    for (const registered of this.sinks) this.deliver(registered, id, event);
  }

  // A listener that throws must not break the run's single consumer loop or
  // starve the sinks queued behind it.
  private deliver(sink: RunSink, id: RunId, event: RunEvent): void {
    try {
      sink.on_event(id, event);
    } catch (thrown) {
      log.warn("sink threw while handling a run event", {
        run_id: id,
        event: event.type,
        error: thrown,
      });
    }
  }

  private close(sink: RunSink, id: RunId, outcome: RunOutcome): void {
    if (!sink.on_end) return;
    try {
      sink.on_end(id, outcome);
    } catch (thrown) {
      log.warn("sink threw while closing a run", {
        run_id: id,
        status: outcome.status,
        error: thrown,
      });
    }
  }
}
