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
  // Checked before the counters: with both embedding flags off no pass can do
  // any work, so there is nothing to wait for — a deliberate configuration must
  // not hold a banner, not even while a queued no-op pass clears its atomic.
  if (!status.embedding_enabled) {
    return { state: "ready" };
  }
  const { eligible_notes: total, embedded_eligible_notes: embedded } = status;
  // A running pass outranks the counts: its snapshot predates the notes it is
  // about to embed, and an empty denominator is not proof it has nothing to do.
  if (status.is_embedding) {
    return { state: "indexing", embedded, total };
  }
  if (embedded >= total) {
    return { state: "ready" };
  }
  // Coverage with notes missing is finished business only once an attempt under
  // the current scope has ended; until then it is work still to come.
  if (status.embed_attempt_completed) {
    return {
      state: "partial",
      embedded,
      total,
      skipped: status.skipped_notes,
    };
  }
  return { state: "indexing", embedded, total };
}
