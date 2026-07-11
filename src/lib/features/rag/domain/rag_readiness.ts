import type { EmbeddingStatus } from "$lib/shared/types/search";

export type RagReadiness =
  | { state: "checking" }
  | { state: "indexing"; embedded: number; total: number }
  | { state: "ready" };

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
