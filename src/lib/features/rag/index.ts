export { RagService } from "$lib/features/rag/application/rag_service";
export {
  collect_rag_query_response,
  handle_rag_mcp_query,
  type RagMcpCitation,
  type RagMcpQueryEvent,
  type RagQueryResponse,
} from "$lib/features/rag/application/rag_mcp_bridge";
export { RagStore } from "$lib/features/rag/state/rag_store.svelte";
export { load_rag_sessions } from "$lib/features/rag/application/rag_sessions_load";
export { register_rag_actions } from "$lib/features/rag/application/rag_actions";
export { default as RagPanel } from "$lib/features/rag/ui/rag_panel.svelte";
export type { RagPersistencePort } from "$lib/features/rag/ports";
export { create_rag_persistence_tauri_adapter } from "$lib/features/rag/adapters/rag_persistence_tauri_adapter";
export type { AgentPort, AgentStreamRequest } from "$lib/features/rag/ports";
export { create_agent_tauri_adapter } from "$lib/features/rag/adapters/agent_tauri_adapter";
export { create_native_agent_tauri_adapter } from "$lib/features/rag/adapters/native_agent_tauri_adapter";
export {
  AgentRunner,
  type AgentCheckpointGit,
  type AgentTurnResult,
} from "$lib/features/rag/application/agent_runner";
export {
  changed_files_from_tools,
  is_mutating_tool,
  type AgentToolCall,
} from "$lib/features/rag/domain/agent_file_ops";
export type {
  AgentDoneStats,
  AgentEvent,
  AgentPermissionMode,
} from "$lib/features/rag/types/agent_events";
export { migrate_agent_fields } from "$lib/features/rag/types/rag_session";
export {
  assemble_context,
  estimate_tokens,
  extract_section,
  type AssembleContextOptions,
  type RagContextCandidate,
} from "$lib/features/rag/domain/rag_context_assembler";
export { build_rag_prompt } from "$lib/features/rag/domain/rag_prompt_builder";
export {
  parse_mentions,
  format_mention_token,
  strip_mention,
  type ParsedMentions,
} from "$lib/features/rag/domain/rag_mentions";
export {
  rewrite_query,
  type RagRewriteResult,
} from "$lib/features/rag/domain/rag_query_rewriter";
export {
  RAG_TEMPLATES,
  scope_phrase,
  type RagTemplate,
  type RagTemplateId,
} from "$lib/features/rag/domain/rag_prompt_templates";
export {
  normalize_folder_scope,
  normalize_tag_scope,
  normalize_base_scope,
  migrate_scope,
  path_in_folder,
} from "$lib/features/rag/domain/rag_scope";
export {
  build_scope_suggestions,
  type ScopeKind,
  type ScopeSuggestion,
  type ScopeSources,
  type ScopeSuggestions,
} from "$lib/features/rag/domain/rag_scope_suggest";
export {
  build_citation_map,
  match_citation_markers,
  resolve_citations,
} from "$lib/features/rag/domain/rag_citations";
export { derive_rag_readiness } from "$lib/features/rag/domain/rag_readiness";
export type { RagReadiness } from "$lib/features/rag/types/rag_readiness";
export type {
  RagCitation,
  RagMessage,
  RagRetrievedContext,
  RagRole,
  RagScope,
  RagSession,
  RagSessionMode,
  RagSessionSummary,
  RagSourceInfo,
  RagStreamEvent,
  RagToolEvent,
} from "$lib/features/rag/domain/rag_types";
