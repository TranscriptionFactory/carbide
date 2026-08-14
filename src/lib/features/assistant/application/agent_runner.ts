import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";
import { chat_policy } from "$lib/features/ai";
import type { VaultStore } from "$lib/features/vault";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type {
  AssistantChatStore,
  RunHandle,
  RunId,
  RunSink,
  RunStarter,
} from "$lib/features/assistant";
import {
  changed_files_from_tools,
  is_mutating_call,
  is_successful_mutating_call,
  paths_from_call,
  rollback_files_from_tools,
  to_vault_relative_path,
  type AgentToolCall,
} from "$lib/features/assistant/domain/agent_file_ops";
import { merge_paths as merge_tool_paths } from "$lib/features/assistant/types/tool_event_fold";
import { session_messages_to_history } from "$lib/features/assistant";
import type { AgentTurnProposalProducer } from "$lib/features/assistant/application/agent_proposal_service";
import { build_turn_report_notice } from "$lib/features/assistant/application/agent_turn_report_notice";

const log = create_logger("agent_runner");

// Declared structurally rather than imported from the git feature, the same
// way this runner has always declared its checkpoint dependency. GitService's
// richer result (which also carries a tag warning on the `created` arm) is
// assignable to this.
export type AgentCheckpointOutcome =
  | { status: "created"; sha: string }
  | { status: "skipped"; sha: string | null }
  | { status: "no_repo" }
  | { status: "failed" };

export type AgentCheckpointGit = {
  create_checkpoint(description: string): Promise<AgentCheckpointOutcome>;
};

export type AgentTurnResult =
  | { status: "done" }
  | { status: "error"; message: string };

// Reads the note's mtime from disk, null when it cannot be read. Disk, never
// the editor store: skip_mtime_guard parks a note's stored mtime at 0, which
// resolves to "no guard" and would reintroduce the unguarded rollback through
// the back door.
export type AgentNoteMtimeReader = (
  note_path: string,
) => Promise<number | null>;

// Captured per turn, keyed by vault-relative path.
type PendingMtimes = Map<string, Promise<number | null>>;

export class AgentRunner {
  private handle: RunHandle | null = null;

  constructor(
    private readonly run_starter: RunStarter,
    private readonly chat_store: AssistantChatStore,
    private readonly vault_store: VaultStore,
    private readonly git: AgentCheckpointGit,
    private readonly refresh_vault: () => Promise<void> | void,
    private readonly sync_changed_notes: (
      paths: string[],
    ) => Promise<void> | void,
    private readonly proposals: AgentTurnProposalProducer,
    private readonly read_note_mtime: AgentNoteMtimeReader,
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
    backend: "acp" | "native",
  ): Promise<AgentTurnResult> {
    const vault = this.vault_store.vault;
    const session = this.chat_store.active;
    if (!vault) return this.fail("No active vault");
    if (!session) return this.fail("No active chat session");

    const anchor = await this.checkpoint();

    const history = session_messages_to_history(session.messages.slice(0, -1));
    const tool_calls: AgentToolCall[] = [];
    const mtimes: PendingMtimes = new Map();

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
            toolset: chat_policy().toolset,
            auto_approve: session.auto_approve,
            history,
            ...(session.agent_session_id
              ? { resume_session_id: session.agent_session_id }
              : {}),
            backend,
          },
        },
        this.transcript_sink(tool_calls, mtimes),
      );

      const run_id = this.handle.id;
      const outcome = await this.handle.outcome;
      await this.finish_turn(anchor, run_id, session.id, tool_calls, mtimes);
      if (outcome.status === "error") {
        return { status: "error", message: outcome.error.message };
      }
      return { status: "done" };
    } catch (err) {
      const message = error_message(err);
      this.chat_store.fail_streaming(message);
      await this.finish_turn(
        anchor,
        this.handle?.id ?? null,
        session.id,
        tool_calls,
        mtimes,
      );
      return { status: "error", message };
    } finally {
      this.handle = null;
    }
  }

  // R8: the turn's transcript writes live here, not in the consumer loop, so
  // retargeting where they land does not mean reopening this runner.
  private transcript_sink(
    tool_calls: AgentToolCall[],
    mtimes: PendingMtimes,
  ): RunSink {
    return {
      on_event: (_run_id, event) => {
        switch (event.type) {
          case "session":
            this.chat_store.set_agent_session_id(event.provider_session_id);
            return;
          case "text":
            this.ensure_streaming();
            this.chat_store.append_streaming_text(event.text);
            return;
          case "tool_start":
            this.ensure_streaming();
            this.chat_store.add_streaming_tool_event({
              id: event.id,
              name: event.name,
              kind: event.kind,
              input_summary: event.input_summary,
              paths: event.paths,
              ...(event.locations.length > 0
                ? { locations: event.locations }
                : {}),
            });
            tool_calls.push({
              id: event.id,
              name: event.name,
              input_summary: event.input_summary,
              paths: event.paths,
              mutating: event.mutating,
            });
            return;
          case "tool_update":
            this.chat_store.apply_streaming_tool_update({
              id: event.id,
              content: event.content,
              paths: event.paths,
              ...(event.input_summary != null
                ? { input_summary: event.input_summary }
                : {}),
              ...(event.name != null ? { name: event.name } : {}),
            });
            return;
          case "tool_end": {
            this.chat_store.finish_streaming_tool_event(
              { id: event.id, name: event.name },
              {
                ok: event.ok,
                result_summary: event.result_summary,
                paths: event.paths,
              },
            );
            // Proposal production reads the accumulated calls, so the union
            // the terminal event restates must land there too.
            const call =
              tool_calls.findLast((c) => c.id === event.id) ??
              tool_calls.findLast((c) => c.name === event.name);
            if (call) {
              call.paths = merge_tool_paths(call.paths, event.paths);
              call.mutating = (call.mutating ?? false) || event.mutating;
              call.ok = event.ok;
              this.capture_mtimes(call, mtimes);
            }
            return;
          }
          case "error":
            this.chat_store.fail_streaming(event.message);
            return;
          case "reasoning":
            this.ensure_streaming();
            this.chat_store.append_streaming_reasoning(event.text);
            return;
          case "permission_request":
            this.ensure_streaming();
            this.chat_store.apply_streaming_permission_request({
              request_id: event.request_id,
              tool_call_id: event.tool_call_id,
              name: event.name,
              kind: event.kind,
              input_summary: event.input_summary,
              paths: event.paths,
              options: event.options,
            });
            return;
          case "permission_resolved":
            this.chat_store.apply_streaming_permission_resolved(
              event.request_id,
              event.outcome,
              event.auto,
            );
            return;
          case "done":
            return;
        }
      },
      // A stopped turn dispatches no terminal event, so the transcript is
      // closed out from here rather than from the "done" event.
      on_end: (_run_id, outcome) => {
        if (outcome.status === "error") return;
        this.chat_store.finish_streaming();
      },
    };
  }

  // Proposals are produced before the vault refresh, not after: producing them
  // rolls the turn's notes back to the checkpoint, and the refresh plus
  // open-note sync must land on that restored state rather than on content
  // that is about to change underneath them.
  private async finish_turn(
    anchor: string | null,
    run_id: RunId | null,
    session_id: string,
    tool_calls: AgentToolCall[],
    mtimes: PendingMtimes,
  ): Promise<void> {
    await this.produce_proposals(
      anchor,
      run_id,
      session_id,
      tool_calls,
      mtimes,
    );
    await this.record_file_changes(tool_calls);
  }

  // The staleness guard is only worth anything if the mtime it compares against
  // was read while the agent's write was still the newest thing on disk. A
  // capture taken at the end of the turn would already contain a user edit made
  // during it: the values would match, the guard would pass, and the rollback
  // would destroy exactly the bytes it exists to protect. So the read is issued
  // here, on the terminal event of the write that produced it, and the last one
  // per path wins.
  private capture_mtimes(call: AgentToolCall, mtimes: PendingMtimes): void {
    if (!is_successful_mutating_call(call)) return;
    const vault_path = String(this.vault_store.vault?.path ?? "");
    for (const path of paths_from_call(call)) {
      const relative = to_vault_relative_path(vault_path, path);
      if (relative === "") continue;
      mtimes.set(
        relative,
        this.read_note_mtime(relative).catch(() => null),
      );
    }
  }

  private async resolve_mtimes(
    mtimes: PendingMtimes,
  ): Promise<Record<string, number>> {
    const settled = await Promise.all(
      [...mtimes].map(
        async ([note_path, pending]) => [note_path, await pending] as const,
      ),
    );
    const resolved: Record<string, number> = {};
    for (const [note_path, mtime] of settled) {
      if (mtime !== null && mtime > 0) resolved[note_path] = mtime;
    }
    return resolved;
  }

  // A failure here must not fail the turn: the writes are on disk either way,
  // and losing the review queue is strictly better than losing the reply.
  private async produce_proposals(
    anchor: string | null,
    run_id: RunId | null,
    session_id: string,
    tool_calls: AgentToolCall[],
    mtimes: PendingMtimes,
  ): Promise<void> {
    const vault_path = String(this.vault_store.vault?.path ?? "");
    // Rollback scope, not refresh scope. A denied tool announces its paths
    // before the permission gate and restates them on the terminal event, so
    // the permissive set contains files the agent was never allowed to write —
    // rolling those back reverts a change the user said no to.
    const touched_paths = rollback_files_from_tools(tool_calls, vault_path);
    if (touched_paths.length === 0) return;

    try {
      const report = await this.proposals.produce({
        anchor,
        origin: { session_id, run_id },
        touched_paths,
        expected_mtimes: await this.resolve_mtimes(mtimes),
      });
      log.info("Agent turn proposals", report);
      const notice = build_turn_report_notice(report);
      if (notice) this.chat_store.add_assistant_message(notice, []);
    } catch (err) {
      log.warn("Agent turn proposal production failed", {
        error: error_message(err),
      });
    }
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
    if (changed.length > 0) this.chat_store.add_changed_files(changed);
    await this.refresh_vault();
    await this.sync_changed_notes(changed);
  }

  private fail(message: string): AgentTurnResult {
    this.chat_store.set_error(message);
    return { status: "error", message };
  }

  private ensure_streaming(): void {
    if (!this.chat_store.streaming_id) this.chat_store.start_streaming();
  }

  // The commit the turn's end-of-turn diff anchors to. Anchoring to the
  // checkpoint rather than to HEAD is what makes the autocommit reactor
  // harmless: it can land a commit mid-turn, and a HEAD-anchored diff would
  // silently lose whatever that commit absorbed.
  //
  // `skipped` still yields an anchor — nothing was committed because the tree
  // already matched HEAD, so HEAD is the pre-turn state. Null means no anchor
  // exists (no repo, unborn branch, or a failed checkpoint) and the turn
  // produces no proposals; see the carve-out named in AgentProposalService.
  private async checkpoint(): Promise<string | null> {
    try {
      const result = await this.git.create_checkpoint("before agent turn");
      switch (result.status) {
        case "created":
          return result.sha;
        case "skipped":
          return result.sha;
        case "no_repo":
        case "failed":
          return null;
      }
    } catch (err) {
      log.warn("Agent checkpoint failed", { error: error_message(err) });
      return null;
    }
  }
}
