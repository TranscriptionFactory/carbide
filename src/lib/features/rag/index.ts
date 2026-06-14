export { RagService } from "$lib/features/rag/application/rag_service";
export { RagStore } from "$lib/features/rag/state/rag_store.svelte";
export { register_rag_actions } from "$lib/features/rag/application/rag_actions";
export { default as RagPanel } from "$lib/features/rag/ui/rag_panel.svelte";
export {
  assemble_context,
  estimate_tokens,
  type AssembleContextOptions,
  type RagContextCandidate,
} from "$lib/features/rag/domain/rag_context_assembler";
export { build_rag_prompt } from "$lib/features/rag/domain/rag_prompt_builder";
export {
  build_citation_map,
  match_citation_markers,
  resolve_citations,
} from "$lib/features/rag/domain/rag_citations";
export type {
  RagCitation,
  RagMessage,
  RagQueryResult,
  RagQueryStatus,
  RagRetrievedContext,
  RagRole,
  RagStreamEvent,
} from "$lib/features/rag/domain/rag_types";
