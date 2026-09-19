import type { EmbeddingStatus } from "$lib/shared/types/search";
import type { RagReadiness } from "$lib/features/rag/types/rag_readiness";

/**
 * Readiness is measured against the notes the embedding pass can actually
 * embed, not against every indexed file. A vault holding an attachment, a code
 * file or an empty note has a raw count it can never satisfy, which is what left
 * the chat banner saying "indexing" forever.
 *
 * `partial` needs an attempt that has *ended* under the current scope: the
 * counts alone cannot tell "nothing embedded yet" from "this is as good as it
 * gets", and idle startup must not read as a finished, incomplete index.
 */
export function derive_rag_readiness(status: EmbeddingStatus): RagReadiness {
  if (status.is_embedding) {
    return {
      state: "indexing",
      embedded: status.embedded_eligible_notes,
      total: status.eligible_notes,
    };
  }
  if (
    status.eligible_notes === 0 ||
    status.embedded_eligible_notes >= status.eligible_notes
  ) {
    return { state: "ready" };
  }
  if (status.embed_attempt_completed) {
    return {
      state: "partial",
      embedded: status.embedded_eligible_notes,
      total: status.eligible_notes,
      skipped: status.skipped_notes,
    };
  }
  return {
    state: "indexing",
    embedded: status.embedded_eligible_notes,
    total: status.eligible_notes,
  };
}
