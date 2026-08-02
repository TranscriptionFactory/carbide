import { vi } from "vitest";
import {
  AssistantKernelService,
  AssistantRunStore,
  AssistantSessionStore,
  start_run_stream,
  type AssistantCitation,
  type AssistantSessionPersistencePort,
} from "$lib/features/assistant";
import type { RagStreamEvent } from "$lib/features/rag";
import {
  OmnibarAskController,
  type OmnibarAskQueryInput,
} from "$lib/features/search/application/omnibar_ask_service";
import {
  create_manual_transport,
  create_mock_probe_port,
  make_provider,
  type ManualTransport,
} from "./assistant_fixtures";

export type AskHarnessOptions = {
  citations?: AssistantCitation[];
  can_insert?: boolean;
  providers?: ReturnType<typeof make_provider>[];
  query_throws?: Error;
};

export type AskHarness = {
  controller: OmnibarAskController;
  sessions: AssistantSessionStore;
  transport: ManualTransport;
  persistence: AssistantSessionPersistencePort;
  probe_calls: () => string[];
  transport_calls: () => number;
  persistence_calls: () => number;
  wait_for_stream: () => Promise<void>;
  inserted: string[];
  opened: string[];
};

// The controller is driven through a REAL kernel and REAL assistant ports, so
// the zero-IO assertions are about genuine port traffic rather than a stubbed
// stand-in for it. `query` mirrors RagService.query's contract: a sources
// event, translated run events, and the three terminal shapes it actually
// emits (done / error / return-without-done on abort).
export function make_ask_harness(options: AskHarnessOptions = {}): AskHarness {
  const providers = options.providers ?? [make_provider()];
  const transport = create_manual_transport();
  const probe = create_mock_probe_port();
  const run_store = new AssistantRunStore();
  const sessions = new AssistantSessionStore();

  const persistence_spies = {
    list_sessions: vi.fn().mockResolvedValue([]),
    load_session: vi.fn().mockResolvedValue(null),
    save_session: vi.fn().mockResolvedValue(undefined),
    delete_session: vi.fn().mockResolvedValue(undefined),
  };
  const persistence: AssistantSessionPersistencePort = persistence_spies;

  const kernel = new AssistantKernelService({
    transport,
    probe,
    run_store,
    vault_path: () => "/vault",
    providers: () => providers,
    // "auto" so the probe port genuinely participates in resolution: pinning a
    // concrete id short-circuits it and would drop a port out of the zero-IO
    // proof it is supposed to anchor.
    default_provider_id: () => "auto",
  });

  async function* query(
    input: OmnibarAskQueryInput,
  ): AsyncGenerator<RagStreamEvent> {
    if (options.query_throws) throw options.query_throws;
    yield {
      type: "sources",
      stats: { retrieved: 2, used: 2, truncated: 0 },
      sources: [],
    };

    const { handle, events } = await start_run_stream(kernel, {
      kind: "chat",
      label: input.question,
      provider: input.provider_config,
      request: {
        mode: "text",
        system_prompt: "",
        messages: [{ role: "user", content: input.question }],
      },
    });
    input.on_run_started?.(handle);

    let emitted_citations = false;
    try {
      for await (const event of events) {
        if (event.type === "text") {
          yield { type: "text", text: event.text };
          if (!emitted_citations) {
            emitted_citations = true;
            for (const citation of options.citations ?? []) {
              yield { type: "citation", citation };
            }
          }
        } else if (event.type === "error") {
          yield { type: "error", error: event.message };
          return;
        } else if (event.type === "end") {
          if (event.outcome.status === "aborted") return;
        }
      }
      yield { type: "done" };
    } finally {
      handle.stop();
    }
  }

  const inserted: string[] = [];
  const opened: string[] = [];

  const controller = new OmnibarAskController({
    query,
    sessions,
    resolve_provider: () => kernel.resolve_provider(),
    insert_at_cursor: (text) => inserted.push(text),
    can_insert: () => options.can_insert ?? true,
    open_session: (id) => opened.push(id),
  });

  return {
    controller,
    sessions,
    transport,
    persistence,
    probe_calls: () => probe._checked,
    transport_calls: () => transport._requests.length,
    persistence_calls: () =>
      Object.values(persistence_spies).reduce(
        (total, spy) => total + spy.mock.calls.length,
        0,
      ),
    // submit() only settles at end of stream, so a test drives the channel
    // between starting the ask and awaiting it; this parks until the transport
    // has actually been entered.
    async wait_for_stream() {
      for (let tick = 0; tick < 50; tick += 1) {
        if (transport._channels.length > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      throw new Error("transport stream was never opened");
    },
    inserted,
    opened,
  };
}
