export { RagService } from "$lib/features/rag/application/rag_service";
export { RagStore } from "$lib/features/rag/state/rag_store.svelte";
export { register_rag_actions } from "$lib/features/rag/application/rag_actions";
export { default as RagPanel } from "$lib/features/rag/ui/rag_panel.svelte";
export type { RagPersistencePort } from "$lib/features/rag/ports";
export { create_rag_persistence_tauri_adapter } from "$lib/features/rag/adapters/rag_persistence_tauri_adapter";
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
  type ParsedMentions,
} from "$lib/features/rag/domain/rag_mentions";
export {
  rewrite_query,
  type RagRewriteResult,
} from "$lib/features/rag/domain/rag_query_rewriter";
export {
  normalize_folder_scope,
  normalize_tag_scope,
  path_in_folder,
} from "$lib/features/rag/domain/rag_scope";
export {
  build_citation_map,
  match_citation_markers,
  resolve_citations,
} from "$lib/features/rag/domain/rag_citations";
export type {
  RagCitation,
  RagMessage,
  RagRetrievedContext,
  RagRole,
  RagScope,
  RagSession,
  RagSessionSummary,
  RagStreamEvent,
} from "$lib/features/rag/domain/rag_types";
