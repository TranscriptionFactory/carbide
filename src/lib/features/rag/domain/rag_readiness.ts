import type { EmbeddingStatus } from "$lib/shared/types/search";
import type { RagReadiness } from "$lib/features/rag/types/rag_readiness";

export function derive_rag_readiness(status: EmbeddingStatus): RagReadiness {
  const indexing =
    status.is_embedding ||
    (status.total_notes > 0 && status.embedded_notes < status.total_notes);
  if (indexing) {
    return {
      state: "indexing",
      embedded: status.embedded_notes,
      total: status.total_notes,
    };
  }
  return { state: "ready" };
}
