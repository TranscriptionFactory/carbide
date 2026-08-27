import type { SearchGraphNode } from "$lib/features/graph/ports";

// Hit scores are hybrid RRF sums (`1/(K + rank)` with K=60), so they land in a
// narrow band near 0.02 and their absolute value tells a reader nothing — only
// the ordering does. Normalizing against the strongest hit turns them into a
// 0–1 strength that is meaningful to display and to filter on.
export function relative_hit_scores(
  nodes: readonly SearchGraphNode[],
): Map<string, number> {
  let max_score = 0;
  for (const node of nodes) {
    if (node.kind === "hit" && node.score != null && node.score > max_score) {
      max_score = node.score;
    }
  }

  const relative = new Map<string, number>();
  if (max_score <= 0) return relative;
  for (const node of nodes) {
    if (node.kind === "hit" && node.score != null) {
      relative.set(node.path, node.score / max_score);
    }
  }
  return relative;
}
