import type { GraphOrderMode } from "$lib/shared/types/editor_settings";

export type { GraphOrderMode };

export type OrderableNode = {
  group: string | undefined;
  date_created_ms?: number | undefined;
  date_modified_ms?: number | undefined;
};

const NAME_COLLATOR = new Intl.Collator("en", { numeric: true });

function node_date(node: OrderableNode, mode: GraphOrderMode): number {
  if (mode === "date_created") return node.date_created_ms ?? 0;
  if (mode === "date_modified") return node.date_modified_ms ?? 0;
  return 0;
}

function group_dates(
  nodes: readonly OrderableNode[],
  mode: GraphOrderMode,
): Map<string, number> {
  const dates = new Map<string, number>();
  for (const node of nodes) {
    if (node.group == null) continue;
    const current = dates.get(node.group) ?? Number.NEGATIVE_INFINITY;
    dates.set(node.group, Math.max(current, node_date(node, mode)));
  }
  return dates;
}

export function compare_graph_groups(
  a: string,
  b: string,
  mode: GraphOrderMode,
  dates: Map<string, number>,
): number {
  if (mode !== "name") {
    const diff = (dates.get(b) ?? 0) - (dates.get(a) ?? 0);
    if (diff !== 0) return diff;
  }
  return NAME_COLLATOR.compare(a, b);
}

export function order_graph_groups(
  nodes: readonly OrderableNode[],
  mode: GraphOrderMode,
): string[] {
  const dates = group_dates(nodes, mode);
  return [...dates.keys()].sort((a, b) =>
    compare_graph_groups(a, b, mode, dates),
  );
}
