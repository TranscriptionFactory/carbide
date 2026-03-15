import type { SemanticEdge } from "$lib/features/graph/ports";
import type { SemanticSearchHit } from "$lib/shared/types/search";

export const SEMANTIC_EDGE_MAX_VAULT_SIZE = 200;
export const SEMANTIC_EDGE_DISTANCE_THRESHOLD = 0.5;
export const SEMANTIC_EDGE_KNN_LIMIT = 3;

export function build_semantic_edges(
  results: Map<string, SemanticSearchHit[]>,
): SemanticEdge[] {
  const seen = new Set<string>();
  const edges: SemanticEdge[] = [];

  for (const [source, hits] of results) {
    for (const hit of hits) {
      if (hit.distance >= SEMANTIC_EDGE_DISTANCE_THRESHOLD) continue;
      const target = hit.note.path;
      const key =
        source < target ? `${source}|${target}` : `${target}|${source}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source, target, distance: hit.distance });
    }
  }

  return edges;
}
