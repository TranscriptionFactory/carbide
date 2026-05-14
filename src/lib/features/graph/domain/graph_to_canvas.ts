import type {
  CanvasData,
  CanvasEdge,
  CanvasNode,
  FileNode,
} from "$lib/features/canvas";
import { radial_layout } from "$lib/features/graph/domain/radial_layout";

export type GraphToCanvasInput = {
  nodes: Array<{ path: string; title: string; kind?: string | undefined }>;
  edges: Array<{ source: string; target: string; label?: string | undefined }>;
  layout: "column" | "radial";
  center_path?: string | undefined;
};

const NODE_W = 300;
const NODE_H = 200;
const COL_GAP = 80;
const ROW_GAP = 40;

function make_file_node(
  id: string,
  path: string,
  x: number,
  y: number,
  w = NODE_W,
  h = NODE_H,
): FileNode {
  return { id, type: "file", file: path, x, y, width: w, height: h };
}

function make_edge(from: string, to: string, label?: string): CanvasEdge {
  const edge: CanvasEdge = {
    id: `${from}->${to}`,
    fromNode: from,
    toNode: to,
    toEnd: "arrow",
  };
  if (label) {
    edge.label = label;
  }
  return edge;
}

function column_layout(input: GraphToCanvasInput): CanvasData {
  const center_path = input.center_path ?? input.nodes[0]?.path;
  if (!center_path) return { nodes: [], edges: [] };

  const path_to_id = new Map<string, string>();
  const adj_in = new Set<string>();
  const adj_out = new Set<string>();

  for (const e of input.edges) {
    if (e.source === center_path) adj_out.add(e.target);
    if (e.target === center_path) adj_in.add(e.source);
  }

  const backlinks = input.nodes.filter(
    (n) => n.path !== center_path && adj_in.has(n.path) && !adj_out.has(n.path),
  );
  const outlinks = input.nodes.filter(
    (n) => n.path !== center_path && adj_out.has(n.path) && !adj_in.has(n.path),
  );
  const both = input.nodes.filter(
    (n) => n.path !== center_path && adj_in.has(n.path) && adj_out.has(n.path),
  );

  const left_col = [...both, ...backlinks];
  const right_col = outlinks;
  const max_col = Math.max(left_col.length, right_col.length, 1);

  const center_x = NODE_W + COL_GAP;
  const center_y = Math.max(0, ((max_col - 1) * (NODE_H + ROW_GAP)) / 2);

  const canvas_nodes: CanvasNode[] = [];
  const center_id = "n-center";
  path_to_id.set(center_path, center_id);
  canvas_nodes.push(make_file_node(center_id, center_path, center_x, center_y));

  for (let i = 0; i < left_col.length; i++) {
    const n = left_col[i];
    if (!n) continue;
    const id = `n-left-${String(i)}`;
    path_to_id.set(n.path, id);
    canvas_nodes.push(make_file_node(id, n.path, 0, i * (NODE_H + ROW_GAP)));
  }

  for (let i = 0; i < right_col.length; i++) {
    const n = right_col[i];
    if (!n) continue;
    const id = `n-right-${String(i)}`;
    path_to_id.set(n.path, id);
    canvas_nodes.push(
      make_file_node(
        id,
        n.path,
        center_x + NODE_W + COL_GAP,
        i * (NODE_H + ROW_GAP),
      ),
    );
  }

  const canvas_edges: CanvasEdge[] = [];
  for (const e of input.edges) {
    const from_id = path_to_id.get(e.source);
    const to_id = path_to_id.get(e.target);
    if (from_id && to_id) {
      canvas_edges.push(make_edge(from_id, to_id, e.label));
    }
  }

  return { nodes: canvas_nodes, edges: canvas_edges };
}

function radial_canvas_layout(input: GraphToCanvasInput): CanvasData {
  const center_path = input.center_path ?? input.nodes[0]?.path;
  if (!center_path) return { nodes: [], edges: [] };

  const result = radial_layout(center_path, input.edges);

  const scale = 2;
  let min_x = Infinity;
  let min_y = Infinity;
  for (const pos of result.positions.values()) {
    if (pos.x * scale < min_x) min_x = pos.x * scale;
    if (pos.y * scale < min_y) min_y = pos.y * scale;
  }
  const offset_x = -min_x + COL_GAP;
  const offset_y = -min_y + COL_GAP;

  const path_to_id = new Map<string, string>();
  const canvas_nodes: CanvasNode[] = [];

  for (let i = 0; i < input.nodes.length; i++) {
    const n = input.nodes[i];
    if (!n) continue;
    const pos = result.positions.get(n.path);
    if (!pos) continue;
    const id = `n-${String(i)}`;
    path_to_id.set(n.path, id);
    canvas_nodes.push(
      make_file_node(
        id,
        n.path,
        pos.x * scale + offset_x,
        pos.y * scale + offset_y,
      ),
    );
  }

  const canvas_edges: CanvasEdge[] = [];
  for (const e of input.edges) {
    const from_id = path_to_id.get(e.source);
    const to_id = path_to_id.get(e.target);
    if (from_id && to_id) {
      canvas_edges.push(make_edge(from_id, to_id, e.label));
    }
  }

  return { nodes: canvas_nodes, edges: canvas_edges };
}

export function graph_to_canvas(input: GraphToCanvasInput): CanvasData {
  if (input.nodes.length === 0) return { nodes: [], edges: [] };
  return input.layout === "radial"
    ? radial_canvas_layout(input)
    : column_layout(input);
}
