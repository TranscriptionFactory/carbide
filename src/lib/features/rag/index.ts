export { RagService } from "$lib/features/rag/application/rag_service";
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
