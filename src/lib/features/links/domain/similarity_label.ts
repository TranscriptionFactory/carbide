export const SIMILARITY_TOOLTIP =
  "Cosine similarity of note embeddings (1.0 = identical meaning). " +
  "~100% means the notes read as near-identical, not that anything is broken.";

export function similarity_label(similarity: number): string {
  if (similarity >= 1) return "100%";
  const percent = Math.min(99, Math.round(similarity * 100));
  return `${String(percent)}%`;
}
