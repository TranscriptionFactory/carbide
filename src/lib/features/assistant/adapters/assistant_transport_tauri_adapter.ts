import { listen } from "@tauri-apps/api/event";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { AsyncQueue } from "$lib/shared/utils/async_queue";
import {
  agent_capability,
  provider_supports_streaming,
  type AiExecutionResult,
  type AiMessage,
  type AiStreamChunk,
} from "$lib/features/ai";
import type { AgentEvent } from "$lib/features/assistant/types/agent_events";
import type {
  AssistantTransportPort,
  TransportRequest,
} from "$lib/features/assistant/ports";
import {
  ABORTED_ERROR,
  type RunEvent,
  type RunRequest,
} from "$lib/features/assistant/types/run";

type TextRequest = Extract<RunRequest, { mode: "text" }>;
type AgentRequest = Extract<RunRequest, { mode: "agent" }>;

type ChannelDescriptor<Request extends RunRequest, Payload> = {
  channel: (request_id: string) => string;
  start_command: string;
  abort_command: string;
  start_args: (
    request_id: string,
    input: TransportRequest,
    request: Request,
  ) => Record<string, unknown>;
  to_run_event: (payload: Payload) => RunEvent;
};

const text_stream_channel: ChannelDescriptor<TextRequest, AiStreamChunk> = {
  channel: (request_id) => `ai:chunk:${request_id}`,
  start_command: "ai_stream_start",
  abort_command: "ai_stream_abort",
  start_args: (request_id, input, request) => ({
    requestId: request_id,
    providerConfig: input.provider_config,
    systemPrompt: request.system_prompt,
    messages: request.messages,
    model: request.model ?? null,
    vaultPath: input.vault_path,
  }),
  to_run_event: (chunk) => {
    switch (chunk.type) {
      case "text":
        return { type: "text", text: chunk.text };
      case "reasoning":
        return { type: "reasoning", text: chunk.text };
      case "error":
        return { type: "error", message: chunk.error };
      case "done":
        return { type: "done" };
    }
  },
};

const agent_turn_channel: ChannelDescriptor<AgentRequest, AgentEvent> = {
  channel: (request_id) => `agent-run-event:${request_id}`,
  start_command: "agent_run_start",
  abort_command: "agent_run_abort",
  start_args: (request_id, input, request) => ({
    requestId: request_id,
    spec: {
      provider_config: input.provider_config,
      prompt: request.prompt,
      vault_path: input.vault_path,
      toolset: request.toolset,
      history: request.history,
      resume_session_id: request.resume_session_id ?? null,
      backend: request.backend,
      adapter: agent_capability(input.provider_config)?.adapter ?? null,
    },
  }),
  to_run_event: (event) => {
    switch (event.type) {
      case "init":
        return { type: "session", provider_session_id: event.session_id };
      case "text":
        return { type: "text", text: event.delta };
      case "reasoning":
        return { type: "reasoning", text: event.delta };
      case "tool_start":
        return {
          type: "tool_start",
          name: event.name,
          input_summary: event.input_summary,
          paths: event.paths,
          mutating: event.mutating,
        };
      case "tool_end":
        return {
          type: "tool_end",
          name: event.name,
          ok: event.ok,
          result_summary: event.result_summary ?? null,
        };
      case "error":
        return { type: "error", message: event.message };
      case "done":
        return { type: "done", stats: event.stats };
    }
  },
};

function drive<Request extends RunRequest, Payload>(
  descriptor: ChannelDescriptor<Request, Payload>,
  input: TransportRequest,
  request: Request,
): AsyncIterable<RunEvent> {
  const request_id = crypto.randomUUID();
  const queue = new AsyncQueue<RunEvent>();
  const signal = input.signal;

  void (async () => {
    const unlisten = await listen<Payload>(
      descriptor.channel(request_id),
      (event) => {
        const run_event = descriptor.to_run_event(event.payload);
        queue.push(run_event);
        if (run_event.type === "done" || run_event.type === "error") {
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
      void tauri_invoke(descriptor.abort_command, { requestId: request_id });
      teardown();
    };

    if (signal?.aborted) {
      on_abort();
      return;
    }
    signal?.addEventListener("abort", on_abort);

    try {
      await tauri_invoke(
        descriptor.start_command,
        descriptor.start_args(request_id, input, request),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      queue.push({ type: "error", message });
      teardown();
    }
  })();

  return queue;
}

const NO_OUTPUT = "The provider exited without producing output.";

function message_text(message: AiMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function blocking_prompt(request: TextRequest): string {
  return [request.system_prompt, ...request.messages.map(message_text)]
    .filter((part) => part.trim() !== "")
    .join("\n\n");
}

// A blocking CLI writes its answer to a file rather than streaming, but it is
// still cancellable: the request id it started under kills its child process.
// `ai_execute_abort` is a no-op on unknown or finished ids, so Stop may fire
// without tracking whether the run is still live.
function drive_blocking(
  input: TransportRequest,
  request: TextRequest,
): AsyncIterable<RunEvent> {
  const request_id = crypto.randomUUID();
  const queue = new AsyncQueue<RunEvent>();
  const signal = input.signal;
  const on_abort = () => {
    void tauri_invoke("ai_execute_abort", { requestId: request_id });
  };

  void (async () => {
    if (signal?.aborted) {
      queue.end();
      return;
    }
    signal?.addEventListener("abort", on_abort);

    try {
      const result = await tauri_invoke<AiExecutionResult>("ai_execute_cli", {
        providerConfig: input.provider_config,
        vaultPath: input.vault_path,
        notePath: request.note_path ?? "",
        prompt: blocking_prompt(request),
        timeoutSeconds: request.timeout_seconds ?? null,
        requestId: request_id,
      });
      if (result.success) {
        if (result.output) queue.push({ type: "text", text: result.output });
        queue.push({ type: "done" });
      } else if (result.error !== ABORTED_ERROR) {
        queue.push({ type: "error", message: result.error ?? NO_OUTPUT });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      queue.push({ type: "error", message });
    } finally {
      signal?.removeEventListener("abort", on_abort);
      queue.end();
    }
  })();

  return queue;
}

export function create_assistant_transport_tauri_adapter(): AssistantTransportPort {
  return {
    stream(input: TransportRequest): AsyncIterable<RunEvent> {
      const request = input.request;
      if (request.mode === "agent") {
        return drive(agent_turn_channel, input, request);
      }
      return provider_supports_streaming(input.provider_config)
        ? drive(text_stream_channel, input, request)
        : drive_blocking(input, request);
    },
  };
}
