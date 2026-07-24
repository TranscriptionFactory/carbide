import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";
import type { VaultStore } from "$lib/features/vault";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { AgentPort } from "$lib/features/rag/ports";
import {
  changed_files_from_tools,
  type AgentToolCall,
} from "$lib/features/rag/domain/agent_file_ops";
import { rag_messages_to_history } from "$lib/features/rag/domain/agent_history";
import type { RagStore } from "$lib/features/rag/state/rag_store.svelte";

const log = create_logger("agent_runner");

export type AgentCheckpointGit = {
  create_checkpoint(description: string): Promise<unknown>;
};

export type AgentTurnResult =
  | { status: "done" }
  | { status: "error"; message: string };

export class AgentRunner {
  private abort_controller: AbortController | null = null;

  constructor(
    private readonly agent_port: AgentPort,
    private readonly rag_store: RagStore,
    private readonly vault_store: VaultStore,
    private readonly git: AgentCheckpointGit,
    private readonly refresh_vault: () => Promise<void> | void,
  ) {}

  get is_running(): boolean {
    return this.abort_controller !== null;
  }

  abort(): void {
    this.abort_controller?.abort();
  }

  async run_turn(
    provider_config: AiProviderConfig,
    prompt: string,
    backend: "harness" | "native",
  ): Promise<AgentTurnResult> {
    const vault = this.vault_store.vault;
    const session = this.rag_store.active;
    if (!vault) return this.fail("No active vault");
    if (!session) return this.fail("No active chat session");

    await this.checkpoint();

    this.abort_controller = new AbortController();
    const history = rag_messages_to_history(session.messages.slice(0, -1));
    const tool_calls: AgentToolCall[] = [];
    try {
      const events = this.agent_port.stream_turn({
        provider_config,
        prompt,
        vault_path: String(vault.path),
        permission_mode: session.permission_mode,
        history,
        ...(session.agent_session_id
          ? { resume_session_id: session.agent_session_id }
          : {}),
        backend,
        signal: this.abort_controller.signal,
      });
      for await (const event of events) {
        if (event.type === "init") {
          this.rag_store.set_agent_session_id(event.session_id);
        } else if (event.type === "text") {
          this.ensure_streaming();
          this.rag_store.append_streaming_text(event.delta);
        } else if (event.type === "tool_start") {
          this.ensure_streaming();
          const call: AgentToolCall = {
            name: event.name,
            input_summary: event.input_summary,
          };
          this.rag_store.add_streaming_tool_event(call);
          tool_calls.push(call);
        } else if (event.type === "tool_end") {
          this.rag_store.finish_streaming_tool_event(event.name, event.ok);
        } else if (event.type === "error") {
          this.rag_store.fail_streaming(event.message);
          return { status: "error", message: event.message };
        }
      }
      const changed = changed_files_from_tools(tool_calls);
      if (changed.length > 0) {
        this.rag_store.add_changed_files(changed);
        await this.refresh_vault();
      }
      this.rag_store.finish_streaming();
      return { status: "done" };
    } catch (err) {
      const message = error_message(err);
      this.rag_store.fail_streaming(message);
      return { status: "error", message };
    } finally {
      this.abort_controller = null;
    }
  }

  private fail(message: string): AgentTurnResult {
    this.rag_store.set_error(message);
    return { status: "error", message };
  }

  private ensure_streaming(): void {
    if (!this.rag_store.streaming_id) this.rag_store.start_streaming();
  }

  private async checkpoint(): Promise<void> {
    try {
      await this.git.create_checkpoint("before agent turn");
    } catch (err) {
      log.warn("Agent checkpoint failed", { error: error_message(err) });
    }
  }
}
