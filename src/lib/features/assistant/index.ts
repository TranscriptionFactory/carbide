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

export type {
  RetrievalOutcome,
  RetrievalReadiness,
  RetrievalRequest,
  RetrievalScope,
  RetrievedNote,
} from "$lib/features/assistant/types/retrieval";

export type { RetrievalPort } from "$lib/features/assistant/ports";

// C3 (AU-040c) — the chat turn itself. Everything below arrived from `rag`:
// context assembly, prompt building, the run kernel, citation mapping and
// stream parsing, the agent-turn cluster, the chat actions and all five UI
// files. Retrieval stayed behind the port.
export {
  AssistantChatService,
  type AssistantChatQueryInput,
} from "$lib/features/assistant/application/assistant_chat_service";

export type {
  AssistantChatStreamEvent,
  AssistantRetrievedContext,
} from "$lib/features/assistant/types/chat_stream";

export {
  answer_chat_mcp_query,
  collect_chat_query_response,
  handle_chat_mcp_query,
  type ChatMcpCitation,
  type ChatMcpQueryEvent,
  type ChatQueryResponse,
} from "$lib/features/assistant/application/chat_mcp_bridge";

export {
  build_chat_query_input,
  type ChatQueryInputRequest,
} from "$lib/features/assistant/application/chat_query_input";

export { register_chat_actions } from "$lib/features/assistant/application/chat_actions";

export { default as ChatPanel } from "$lib/features/assistant/ui/chat_panel.svelte";

export {
  AgentRunner,
  type AgentCheckpointGit,
  type AgentTurnResult,
} from "$lib/features/assistant/application/agent_runner";

export {
  changed_files_from_tools,
  is_mutating_tool,
  paths_from_summary,
  type AgentToolCall,
} from "$lib/features/assistant/domain/agent_file_ops";

export {
  citations_from_tools,
  is_citation_source_tool,
} from "$lib/features/assistant/domain/agent_citations";

export { build_chat_prompt } from "$lib/features/assistant/domain/chat_prompt_builder";

export {
  parse_mentions,
  format_mention_token,
  strip_mention,
  type ParsedMentions,
} from "$lib/features/assistant/domain/mention_tokens";

export {
  rewrite_query,
  type QueryRewriteResult,
} from "$lib/features/assistant/domain/query_rewriter";

export {
  scope_phrase,
  to_retrieval_scope,
  normalize_folder_scope,
  normalize_tag_scope,
  normalize_base_scope,
  normalize_note_scope,
  path_in_folder,
} from "$lib/features/assistant/domain/chat_scope";

export {
  build_scope_suggestions,
  type ScopeKind,
  type ScopeSuggestion,
  type ScopeSources,
  type ScopeSuggestions,
} from "$lib/features/assistant/domain/scope_suggest";

export {
  build_citation_map,
  match_citation_markers,
  resolve_citations,
} from "$lib/features/assistant/domain/chat_citations";

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

export {
  create_assistant_permission_tauri_adapter,
  create_assistant_transport_tauri_adapter,
} from "$lib/features/assistant/adapters/assistant_transport_tauri_adapter";

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
  proposal_path,
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
  type ProposalTarget,
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
  AssistantDocumentPort,
  AssistantEditTarget,
  ProposalCheckpointOutcome,
  ProposalCheckpointPort,
  ProposalNotePort,
  ProposalPersistencePort,
} from "$lib/features/assistant/ports";

// Pin 5 — edit the open tab.
export type { DocumentAttachment } from "$lib/features/assistant/types/attachment";
export {
  ATTACHMENT_MAX_CHARS,
  attachment_label,
  build_document_attachment,
  type AttachmentResult,
} from "$lib/features/assistant/domain/document_attachment";
export {
  build_document_edit_prompt,
  build_note_edit_prompt,
} from "$lib/features/assistant/domain/edit_target_prompt";
export {
  DocumentEditService,
  type EditOpenTabRequest,
  type EditOpenTabResult,
  type EditOpenTabTarget,
} from "$lib/features/assistant/application/document_edit_service";
export { register_assistant_edit_actions } from "$lib/features/assistant/application/assistant_edit_actions";

// I8 as amended — pending-proposal persistence.
export {
  parse_stored,
  to_stored,
  PROPOSAL_STORAGE_CAP,
  PROPOSAL_STORAGE_VERSION,
  type StoredProposals,
} from "$lib/features/assistant/domain/proposal_storage";
export { ProposalPersistenceService } from "$lib/features/assistant/application/proposal_persistence_service";
export { load_assistant_proposals } from "$lib/features/assistant/application/assistant_proposals_load";
export {
  group_proposals_by_day,
  type ProposalDayGroup,
  type ProposalProvenanceGroup,
} from "$lib/features/assistant/domain/proposal_day_groups";
export { create_assistant_proposal_persistence_tauri_adapter } from "$lib/features/assistant/adapters/assistant_proposal_persistence_tauri_adapter";

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

// The ambient reactor takes the producer as a dependency rather than importing
// it: the layering lint bans cross-feature deep imports, so a reactor can only
// reach it through this barrel.
export { produce_ambient_notices } from "$lib/features/assistant/domain/ambient_producers";

export { register_assistant_notice_actions } from "$lib/features/assistant/application/assistant_notice_actions";

export { default as AssistantNoticeRail } from "$lib/features/assistant/ui/assistant_notice_rail.svelte";
export { default as AssistantNoticeCard } from "$lib/features/assistant/ui/assistant_notice_card.svelte";
