export { RagService } from "$lib/features/rag/application/rag_service";
export {
  collect_rag_query_response,
  handle_rag_mcp_query,
  type RagMcpCitation,
  type RagMcpQueryEvent,
  type RagQueryResponse,
} from "$lib/features/rag/application/rag_mcp_bridge";
export { register_rag_actions } from "$lib/features/rag/application/rag_actions";
export { default as RagPanel } from "$lib/features/rag/ui/rag_panel.svelte";
export {
  AgentRunner,
  type AgentCheckpointGit,
  type AgentTurnResult,
} from "$lib/features/rag/application/agent_runner";
export {
  changed_files_from_tools,
  is_mutating_tool,
  paths_from_summary,
  type AgentToolCall,
} from "$lib/features/rag/domain/agent_file_ops";
export {
  citations_from_tools,
  is_citation_source_tool,
} from "$lib/features/rag/domain/agent_citations";
export type { AgentPermissionMode } from "$lib/features/rag/types/agent_events";
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
  scope_phrase,
  normalize_folder_scope,
  normalize_tag_scope,
  normalize_base_scope,
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
