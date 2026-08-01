import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";
import { chat_policy } from "$lib/features/ai";
import type { VaultStore } from "$lib/features/vault";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { RunHandle, RunSink, RunStarter } from "$lib/features/assistant";
import {
  changed_files_from_tools,
  is_mutating_call,
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
  private handle: RunHandle | null = null;

  constructor(
    private readonly run_starter: RunStarter,
    private readonly rag_store: RagStore,
    private readonly vault_store: VaultStore,
    private readonly git: AgentCheckpointGit,
    private readonly refresh_vault: () => Promise<void> | void,
    private readonly sync_changed_notes: (
      paths: string[],
    ) => Promise<void> | void,
  ) {}

  get is_running(): boolean {
    return this.handle !== null;
  }

  abort(): void {
    this.handle?.stop();
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

    const history = rag_messages_to_history(session.messages.slice(0, -1));
    const tool_calls: AgentToolCall[] = [];

    try {
      this.handle = await this.run_starter.start(
        {
          kind: "agent",
          label: prompt,
          provider: provider_config,
          origin: { session_id: session.id },
          request: {
            mode: "agent",
            prompt,
            toolset: chat_policy(session.permission_mode).toolset,
            history,
            ...(session.agent_session_id
              ? { resume_session_id: session.agent_session_id }
              : {}),
            backend,
          },
        },
        this.transcript_sink(tool_calls),
      );

      const outcome = await this.handle.outcome;
      await this.record_file_changes(tool_calls);
      if (outcome.status === "error") {
        return { status: "error", message: outcome.error.message };
      }
      return { status: "done" };
    } catch (err) {
      const message = error_message(err);
      this.rag_store.fail_streaming(message);
      await this.record_file_changes(tool_calls);
      return { status: "error", message };
    } finally {
      this.handle = null;
    }
  }

  // R8: the turn's transcript writes live here, not in the consumer loop, so
  // retargeting where they land does not mean reopening this runner.
  private transcript_sink(tool_calls: AgentToolCall[]): RunSink {
    return {
      on_event: (_run_id, event) => {
        switch (event.type) {
          case "session":
            this.rag_store.set_agent_session_id(event.provider_session_id);
            return;
          case "text":
            this.ensure_streaming();
            this.rag_store.append_streaming_text(event.text);
            return;
          case "tool_start":
            this.ensure_streaming();
            this.rag_store.add_streaming_tool_event({
              name: event.name,
              input_summary: event.input_summary,
              paths: event.paths,
            });
            tool_calls.push({
              name: event.name,
              input_summary: event.input_summary,
              paths: event.paths,
              mutating: event.mutating,
            });
            return;
          case "tool_end":
            this.rag_store.finish_streaming_tool_event(event.name, event.ok);
            return;
          case "error":
            this.rag_store.fail_streaming(event.message);
            return;
          case "reasoning":
          case "done":
            return;
        }
      },
      // A stopped turn dispatches no terminal event, so the transcript is
      // closed out from here rather than from the "done" event.
      on_end: (_run_id, outcome) => {
        if (outcome.status === "error") return;
        this.rag_store.finish_streaming();
      },
    };
  }

  // Edits a turn made before failing are still on disk; the vault tree and the
  // session's changed-files record have to reflect them either way. A mutating
  // tool whose paths could not be resolved still means the vault is stale, so
  // the refresh is driven by the tool set, not by the resolved paths.
  private async record_file_changes(
    tool_calls: AgentToolCall[],
  ): Promise<void> {
    if (!tool_calls.some(is_mutating_call)) return;
    const vault_path = String(this.vault_store.vault?.path ?? "");
    const changed = changed_files_from_tools(tool_calls, vault_path);
    if (changed.length > 0) this.rag_store.add_changed_files(changed);
    await this.refresh_vault();
    await this.sync_changed_notes(changed);
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
