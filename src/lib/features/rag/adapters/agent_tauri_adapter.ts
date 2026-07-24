import { listen } from "@tauri-apps/api/event";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { AsyncQueue } from "$lib/shared/utils/async_queue";
import type { AgentEvent } from "$lib/features/rag/types/agent_events";
import type { AgentPort, AgentStreamRequest } from "$lib/features/rag/ports";

export function create_agent_tauri_adapter(): AgentPort {
  return {
    stream_turn(input: AgentStreamRequest): AsyncIterable<AgentEvent> {
      const request_id = crypto.randomUUID();
      const queue = new AsyncQueue<AgentEvent>();
      const signal = input.signal;

      const iterable: AsyncIterable<AgentEvent> = {
        [Symbol.asyncIterator]() {
          return queue[Symbol.asyncIterator]();
        },
      };

      void (async () => {
        const unlisten = await listen<AgentEvent>(
          `agent-run-event:${request_id}`,
          (event) => {
            const payload = event.payload;
            queue.push(payload);
            if (payload.type === "done" || payload.type === "error") {
              teardown();
            }
          },
        );

        const teardown = () => {
          unlisten();
          signal?.removeEventListener("abort", on_abort);
          queue.end();
        };

        const on_abort = () => {
          void tauri_invoke("agent_run_abort", { requestId: request_id });
          teardown();
        };

        if (signal?.aborted) {
          on_abort();
          return;
        }
        signal?.addEventListener("abort", on_abort);

        try {
          await tauri_invoke("agent_run_start", {
            requestId: request_id,
            spec: {
              provider_config: input.provider_config,
              prompt: input.prompt,
              vault_path: input.vault_path,
              toolset: input.toolset,
              history: input.history,
              resume_session_id: input.resume_session_id ?? null,
              backend: input.backend,
            },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          queue.push({ type: "error", message: msg });
          teardown();
        }
      })();

      return iterable;
    },
  };
}
