import type {
  SearchGraphNode,
  SearchGraphSortMode,
} from "$lib/features/graph/ports";

export type { SearchGraphSortMode };

function secondary_key(
  node: SearchGraphNode,
  mode: SearchGraphSortMode,
): number {
  if (mode === "date_modified") return node.date_modified_ms ?? 0;
  if (mode === "date_created") return node.date_created_ms ?? 0;
  return node.score ?? 0;
}

export function compare_search_graph_nodes(
  a: SearchGraphNode,
  b: SearchGraphNode,
  mode: SearchGraphSortMode,
  ascending: boolean,
): number {
  if (a.kind !== b.kind) return a.kind === "hit" ? -1 : 1;

  const direction = ascending ? 1 : -1;

  if (mode === "name") {
    return direction * a.title.localeCompare(b.title);
  }

  const diff = secondary_key(a, mode) - secondary_key(b, mode);
  if (diff !== 0) return direction * diff;
  return direction * ((a.score ?? 0) - (b.score ?? 0));
}

export function sort_search_graph_nodes(
  nodes: SearchGraphNode[],
  mode: SearchGraphSortMode,
  ascending: boolean,
): SearchGraphNode[] {
  return [...nodes].sort((a, b) =>
    compare_search_graph_nodes(a, b, mode, ascending),
  );
}
