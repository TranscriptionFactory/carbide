import { listen } from "@tauri-apps/api/event";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { AsyncQueue } from "$lib/shared/utils/async_queue";
import type {
  AiStreamChunk,
  AiStreamRequest,
} from "$lib/features/ai/domain/ai_stream_types";
import type { AiStreamPort } from "$lib/features/ai/ports";

type AiStreamEvent = AiStreamChunk;

export function create_ai_stream_adapter(): AiStreamPort {
  return {
    stream_text(input: AiStreamRequest): AsyncIterable<AiStreamChunk> {
      const request_id = crypto.randomUUID();
      const queue = new AsyncQueue<AiStreamChunk>();

      const iterable: AsyncIterable<AiStreamChunk> = {
        [Symbol.asyncIterator]() {
          return queue[Symbol.asyncIterator]();
        },
      };

      (async () => {
        const unlisten = await listen<AiStreamEvent>(
          `ai:chunk:${request_id}`,
          (event) => {
            const chunk = event.payload;
            queue.push(chunk);
            if (chunk.type === "done" || chunk.type === "error") {
              queue.end();
            }
          },
        );

        try {
          await tauri_invoke("ai_stream_start", {
            requestId: request_id,
            providerConfig: input.provider_config,
            systemPrompt: input.system_prompt,
            messages: input.messages,
            model: input.model ?? null,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          queue.push({ type: "error", error: msg });
          queue.end();
          unlisten();
        }
      })();

      return iterable;
    },

    abort(request_id: string): void {
      void tauri_invoke("ai_stream_abort", { requestId: request_id });
    },
  };
}
