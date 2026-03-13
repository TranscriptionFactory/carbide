import type { GraphNeighborhoodSnapshot } from "$lib/features/graph/ports";
import type { NoteMeta } from "$lib/shared/types/note";

export type GraphVisualNodeKind =
  | "center"
  | "backlink"
  | "outlink"
  | "both"
  | "orphan";

export type GraphVisualNode = {
  id: string;
  label: string;
  path: string;
  meta: string | null;
  kind: GraphVisualNodeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
  hovered: boolean;
  existing: boolean;
};

export type GraphVisualEdge = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dashed: boolean;
};

export type GraphCanvasView = {
  width: number;
  height: number;
  nodes: GraphVisualNode[];
  edges: GraphVisualEdge[];
};

type RelatedNode = {
  note: NoteMeta;
  kind: "backlink" | "outlink" | "both";
};

const NODE_WIDTH = 176;
const NODE_HEIGHT = 44;
const CENTER_X = 372;
const CENTER_Y = 184;
const LEFT_X = 44;
const RIGHT_X = 524;
const TOP_Y = 28;
const BOTTOM_Y = 336;
const COLUMN_GAP = 60;

function title_from_path(path: string): string {
  const leaf = path.split("/").pop() ?? path;
  return leaf.endsWith(".md") ? leaf.slice(0, -3) : leaf;
}

function format_note_meta(note: NoteMeta): string {
  return note.path;
}

function matches_query(query: string, value: string): boolean {
  if (!query) {
    return true;
  }

  return value.toLocaleLowerCase().includes(query);
}

function dedupe_related_nodes(snapshot: GraphNeighborhoodSnapshot): RelatedNode[] {
  const nodes = new Map<string, RelatedNode>();

  for (const note of snapshot.backlinks) {
    nodes.set(note.path, {
      note,
      kind: "backlink",
    });
  }

  for (const note of snapshot.outlinks) {
    const existing = nodes.get(note.path);
    if (!existing) {
      nodes.set(note.path, {
        note,
        kind: "outlink",
      });
      continue;
    }

    nodes.set(note.path, {
      note,
      kind: existing.kind === "backlink" ? "both" : existing.kind,
    });
  }

  return Array.from(nodes.values()).sort((left, right) =>
    left.note.path.localeCompare(right.note.path),
  );
}

function layout_row<T>(
  items: T[],
  y: number,
  width: number,
  pick_id: (item: T, index: number) => string,
  build_node: (item: T, index: number, x: number) => GraphVisualNode,
): GraphVisualNode[] {
  if (items.length === 0) {
    return [];
  }

  const total_width = items.length * NODE_WIDTH + (items.length - 1) * 16;
  const start_x = Math.max(16, Math.floor((width - total_width) / 2));

  return items.map((item, index) => {
    const x = start_x + index * (NODE_WIDTH + 16);
    const node = build_node(item, index, x);
    return {
      ...node,
      id: pick_id(item, index),
      y,
    };
  });
}

function layout_column(
  nodes: RelatedNode[],
  x: number,
  start_y: number,
  build_node: (node: RelatedNode, index: number, y: number) => GraphVisualNode,
): GraphVisualNode[] {
  return nodes.map((node, index) => {
    const y = start_y + index * (NODE_HEIGHT + 18);
    return {
      ...build_node(node, index, y),
      x,
      y,
    };
  });
}

function edge_from_center(
  center: GraphVisualNode,
  node: GraphVisualNode,
): GraphVisualEdge {
  const center_mid_x = center.x + center.width / 2;
  const center_mid_y = center.y + center.height / 2;
  const node_mid_x = node.x + node.width / 2;
  const node_mid_y = node.y + node.height / 2;

  if (node.kind === "backlink") {
    return {
      id: `${center.id}:${node.id}`,
      x1: center.x,
      y1: center_mid_y,
      x2: node.x + node.width,
      y2: node_mid_y,
      dashed: false,
    };
  }

  if (node.kind === "outlink") {
    return {
      id: `${center.id}:${node.id}`,
      x1: center.x + center.width,
      y1: center_mid_y,
      x2: node.x,
      y2: node_mid_y,
      dashed: false,
    };
  }

  if (node.kind === "orphan") {
    return {
      id: `${center.id}:${node.id}`,
      x1: center_mid_x,
      y1: center.y + center.height,
      x2: node_mid_x,
      y2: node.y,
      dashed: true,
    };
  }

  return {
    id: `${center.id}:${node.id}`,
    x1: center_mid_x,
    y1: center.y,
    x2: node_mid_x,
    y2: node.y + node.height,
    dashed: false,
  };
}

export function resolve_graph_canvas_view(input: {
  snapshot: GraphNeighborhoodSnapshot;
  filter_query: string;
  selected_node_ids: string[];
  hovered_node_id: string | null;
}): GraphCanvasView {
  const query = input.filter_query.trim().toLocaleLowerCase();
  const selected = new Set(input.selected_node_ids);
  const related_nodes = dedupe_related_nodes(input.snapshot).filter((entry) =>
    matches_query(query, `${entry.note.title} ${entry.note.path}`),
  );
  const bidirectional = related_nodes.filter((entry) => entry.kind === "both");
  const backlinks = related_nodes.filter((entry) => entry.kind === "backlink");
  const outlinks = related_nodes.filter((entry) => entry.kind === "outlink");
  const orphan_links = input.snapshot.orphan_links.filter((entry) =>
    matches_query(query, entry.target_path),
  );

  const max_column_length = Math.max(
    backlinks.length,
    outlinks.length,
    bidirectional.length > 0 ? 1 : 0,
  );
  const height = Math.max(
    460,
    BOTTOM_Y +
      Math.max(1, orphan_links.length) * (NODE_HEIGHT + 16) +
      24,
    CENTER_Y + max_column_length * (NODE_HEIGHT + COLUMN_GAP) + 120,
  );

  const center: GraphVisualNode = {
    id: input.snapshot.center.path,
    label: input.snapshot.center.title,
    path: input.snapshot.center.path,
    meta: format_note_meta(input.snapshot.center),
    kind: "center",
    x: CENTER_X,
    y: CENTER_Y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    selected: selected.has(input.snapshot.center.path),
    hovered: input.hovered_node_id === input.snapshot.center.path,
    existing: true,
  };

  const top_nodes = layout_row(
    bidirectional,
    TOP_Y,
    760,
    (entry) => entry.note.path,
    (entry) => ({
      label: entry.note.title,
      path: entry.note.path,
      meta: format_note_meta(entry.note),
      kind: "both",
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      selected: selected.has(entry.note.path),
      hovered: input.hovered_node_id === entry.note.path,
      existing: true,
      x: 0,
      y: 0,
      id: entry.note.path,
    }),
  );

  const left_nodes = layout_column(backlinks, LEFT_X, 96, (entry) => ({
    id: entry.note.path,
    label: entry.note.title,
    path: entry.note.path,
    meta: format_note_meta(entry.note),
    kind: "backlink",
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    selected: selected.has(entry.note.path),
    hovered: input.hovered_node_id === entry.note.path,
    existing: true,
    x: 0,
    y: 0,
  }));

  const right_nodes = layout_column(outlinks, RIGHT_X, 96, (entry) => ({
    id: entry.note.path,
    label: entry.note.title,
    path: entry.note.path,
    meta: format_note_meta(entry.note),
    kind: "outlink",
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    selected: selected.has(entry.note.path),
    hovered: input.hovered_node_id === entry.note.path,
    existing: true,
    x: 0,
    y: 0,
  }));

  const orphan_nodes = layout_row(
    orphan_links,
    BOTTOM_Y,
    760,
    (entry) => entry.target_path,
    (entry) => ({
      id: entry.target_path,
      label: title_from_path(entry.target_path),
      path: entry.target_path,
      meta: `${String(entry.ref_count)} refs`,
      kind: "orphan",
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      selected: selected.has(entry.target_path),
      hovered: input.hovered_node_id === entry.target_path,
      existing: false,
      x: 0,
      y: 0,
    }),
  );

  const nodes = [center, ...top_nodes, ...left_nodes, ...right_nodes, ...orphan_nodes];
  const edges = nodes
    .filter((node) => node.kind !== "center")
    .map((node) => edge_from_center(center, node));

  return {
    width: 760,
    height,
    nodes,
    edges,
  };
}
