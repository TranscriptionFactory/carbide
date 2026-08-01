import { humanize_ai_error } from "$lib/features/ai";
import { resolve_assistant_provider } from "$lib/features/assistant/domain/resolve_assistant_provider";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { AssistantRunStore } from "$lib/features/assistant/state/assistant_run_store.svelte";
import type {
  AssistantProviderProbePort,
  AssistantTransportPort,
} from "$lib/features/assistant/ports";
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

const NO_PROVIDER =
  "No AI provider is available — configure one in Settings, then try again.";

function message_of(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

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

  async start(spec: RunSpec, sink?: RunSink): Promise<RunHandle> {
    const provider = spec.provider ?? (await this.resolve_provider());
    const id = this.mint_id();
    const stop = () => {
      this.stop(id);
    };

    if (!provider) {
      this.deps.run_store.start(id, spec, Date.now());
      return {
        id,
        stop,
        outcome: Promise.resolve(this.fail(id, NO_PROVIDER, sink)),
      };
    }

    this.deps.run_store.start(id, { ...spec, provider }, Date.now());
    const controller = new AbortController();
    this.controllers.set(id, controller);

    return {
      id,
      stop,
      outcome: this.consume(id, spec, provider, controller.signal, sink),
    };
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

  // resolve_assistant_provider throws NOT_IMPLEMENTED until AU-003 lands.
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
    signal: AbortSignal,
    sink?: RunSink,
  ): Promise<RunOutcome> {
    const runs = this.deps.run_store;

    try {
      for await (const event of this.deps.transport.stream({
        provider_config: provider,
        request: spec.request,
        vault_path: this.deps.vault_path(),
        signal,
      })) {
        if (signal.aborted) break;

        if (event.type === "error") {
          return this.fail(id, event.message, sink, provider);
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
      return this.fail(id, message_of(thrown), sink, provider);
    } finally {
      this.controllers.delete(id);
    }

    if (signal.aborted) return { status: "aborted", text: runs.text_of(id) };

    runs.set_status(id, "done");
    return { status: "done", text: runs.text_of(id), stats: null };
  }

  private fail(
    id: RunId,
    raw: string,
    sink?: RunSink,
    provider?: AiProviderConfig,
  ): RunOutcome {
    const error: AssistantUserError = provider
      ? humanize_ai_error(raw, provider)
      : { message: raw, detail: raw };
    this.dispatch(id, { type: "error", message: error.message }, sink);
    return { status: "error", error, text: this.deps.run_store.text_of(id) };
  }

  private dispatch(id: RunId, event: RunEvent, sink?: RunSink): void {
    this.deps.run_store.apply_event(id, event);
    sink?.on_event(id, event);
    for (const registered of this.sinks) registered.on_event(id, event);
  }
}
