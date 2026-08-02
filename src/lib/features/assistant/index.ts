export { ABORTED_ERROR } from "$lib/features/assistant/types/run";

export type {
  AssistantUserError,
  RunEvent,
  RunHandle,
  RunId,
  RunKind,
  RunOrigin,
  RunOutcome,
  RunRecord,
  RunRequest,
  RunSink,
  RunSpec,
  RunStarter,
  RunStats,
  RunStatus,
} from "$lib/features/assistant/types/run";

export {
  start_run_stream,
  type RunStream,
  type RunStreamEnd,
  type RunStreamItem,
} from "$lib/features/assistant/application/run_stream";

// C3 (AU-040a) — the agent turn's wire types. Both were declared in `rag` and
// consumed only from here; they are transport concerns with no retrieval
// content, and they were the whole of the assistant → rag edge.
export type { AgentEvent } from "$lib/features/assistant/types/agent_events";

export {
  session_messages_to_history,
  type AgentHistoryMessage,
  type AgentHistoryToolCall,
} from "$lib/features/assistant/types/agent_history";

export type {
  AssistantProviderProbePort,
  AssistantSessionPersistencePort,
  AssistantTransportPort,
  TransportRequest,
} from "$lib/features/assistant/ports";

export { to_assistant_session_summary } from "$lib/features/assistant/types/session";

export type {
  AssistantChatMode,
  AssistantCitation,
  AssistantContextStats,
  AssistantMessage,
  AssistantPermissionMode,
  AssistantRole,
  AssistantScope,
  AssistantSession,
  AssistantSessionKind,
  AssistantSessionSummary,
  AssistantTitleSource,
  AssistantToolCall,
  AssistantToolEvent,
} from "$lib/features/assistant/types/session";

export type { AssistantChatSourceInfo } from "$lib/features/assistant/types/chat_stream";

export type { RetrievalReadiness } from "$lib/features/assistant/types/retrieval";

// C3 (AU-040b) — the session model and its hydration boundary. migrate_scope
// and migrate_session_fields travel with the loader that calls them; they are
// the only thing standing between a pre-C1 session file and an empty chat list.
export {
  derive_session_title,
  migrate_scope,
  migrate_session_fields,
  sanitize_generated_title,
  should_autotitle,
  type StoredAssistantSession,
} from "$lib/features/assistant/types/assistant_session_model";

export { AssistantChatStore } from "$lib/features/assistant/state/assistant_chat_store.svelte";

export { AssistantSessionService } from "$lib/features/assistant/application/assistant_session_service";

export { load_assistant_sessions } from "$lib/features/assistant/application/assistant_sessions_load";

export { AssistantRunStore } from "$lib/features/assistant/state/assistant_run_store.svelte";

export {
  AssistantSessionStore,
  type AssistantSessionCreate,
  type AssistantSessionPatch,
} from "$lib/features/assistant/state/assistant_session_store.svelte";

export { create_session_run_sink } from "$lib/features/assistant/application/session_run_sink";

export {
  AssistantKernelService,
  type AssistantKernelDeps,
} from "$lib/features/assistant/application/assistant_kernel_service";

export {
  resolve_assistant_provider,
  type ProviderResolution,
  type ProviderResolutionInput,
} from "$lib/features/assistant/domain/resolve_assistant_provider";

export { create_assistant_transport_tauri_adapter } from "$lib/features/assistant/adapters/assistant_transport_tauri_adapter";

export { register_assistant_actions } from "$lib/features/assistant/application/assistant_actions";

export { default as AssistantPresence } from "$lib/features/assistant/ui/assistant_presence.svelte";
export { default as AssistantRunsPopover } from "$lib/features/assistant/ui/assistant_runs_popover.svelte";
export { default as AssistantStopButton } from "$lib/features/assistant/ui/assistant_stop_button.svelte";
export { default as AssistantSessionTabView } from "$lib/features/assistant/ui/assistant_session_tab_view.svelte";
export { default as AssistantSessionList } from "$lib/features/assistant/ui/assistant_session_list.svelte";
export {
  assemble_context,
  estimate_tokens,
  DEFAULT_CONTEXT_BUDGET,
  type ContextBudget,
  type ContextAssembly,
  type ContextStats,
  type AssembledBlock,
  type DroppedBlock,
  type DropReason,
} from "$lib/features/assistant/domain/context_assembler";
export {
  type ContextBlock,
  type ContextSource,
} from "$lib/features/assistant/domain/context_source";
export {
  context_window,
  extract_line_range,
  type CharWindow,
} from "$lib/features/assistant/domain/context_window";
export { create_assistant_session_persistence_tauri_adapter } from "$lib/features/assistant/adapters/assistant_session_persistence_tauri_adapter";

// C2 — proposals. Exported at contract time, not at implementation time:
// AU-020 was merged with zero barrel exposure in C1 and was unreachable from
// rag/ai under the deep-import rule (D1-11), costing an out-of-band
// integration commit. Not repeating it.
export {
  to_proposal_summary,
  type NoteRevision,
  type Proposal,
  type ProposalHunk,
  type ProposalHunkId,
  type ProposalId,
  type ProposalLine,
  type ProposalLineKind,
  type ProposalOrigin,
  type ProposalStatus,
  type ProposalSummary,
} from "$lib/features/assistant/types/proposal";

export {
  compute_note_revision,
  is_stale,
} from "$lib/features/assistant/domain/note_revision";

export { AssistantProposalStore } from "$lib/features/assistant/state/assistant_proposal_store.svelte";

export {
  ProposalApplyService,
  type ProposalApplyDeps,
  type ProposalApplyOutcome,
} from "$lib/features/assistant/application/proposal_apply_service";

export type {
  ProposalCheckpointOutcome,
  ProposalCheckpointPort,
  ProposalNotePort,
} from "$lib/features/assistant/ports";

export { default as AssistantProposalsTabView } from "$lib/features/assistant/ui/assistant_proposals_tab_view.svelte";

// C3 — ambient notices. Exported at contract time, not at implementation time
// (D1-11), so AU-060 and AU-061 build against a reachable surface from minute
// one instead of costing an out-of-band integration commit.
export {
  AMBIENT_PROPOSAL_ORIGIN,
  AMBIENT_RAIL_CARD_CAP,
  AMBIENT_SESSION_ID,
  AMBIENT_TOAST_DEDUPE_KEY,
  AMBIENT_TOAST_MAX_CONCURRENT,
  type AmbientAnchor,
  type AmbientNotice,
  type AmbientNoticeId,
  type AmbientNoticeKind,
  type AmbientNoticeOffer,
} from "$lib/features/assistant/types/ambient";

export { AssistantNoticeStore } from "$lib/features/assistant/state/assistant_notice_store.svelte";

export {
  partition_notices,
  type NoticePartition,
} from "$lib/features/assistant/domain/partition_notices";
