import type {
  CanvasEdge,
  CanvasNode,
  NodeSide,
} from "$lib/features/canvas/types/canvas";

type Point = { x: number; y: number };

export function get_edge_endpoints(
  edge: CanvasEdge,
  node_map: Map<string, CanvasNode>,
): { from: Point; to: Point } | null {
  const from_node = node_map.get(edge.fromNode);
  const to_node = node_map.get(edge.toNode);
  if (!from_node || !to_node) return null;

  const from = get_anchor_point(from_node, edge.fromSide, to_node);
  const to = get_anchor_point(to_node, edge.toSide, from_node);

  return { from, to };
}

function get_anchor_point(
  node: CanvasNode,
  side: NodeSide | undefined,
  target: CanvasNode,
): Point {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;

  const resolved_side = side ?? auto_side(node, target);

  switch (resolved_side) {
    case "top":
      return { x: cx, y: node.y };
    case "bottom":
      return { x: cx, y: node.y + node.height };
    case "left":
      return { x: node.x, y: cy };
    case "right":
      return { x: node.x + node.width, y: cy };
  }
}

function auto_side(from: CanvasNode, to: CanvasNode): NodeSide {
  const from_cx = from.x + from.width / 2;
  const from_cy = from.y + from.height / 2;
  const to_cx = to.x + to.width / 2;
  const to_cy = to.y + to.height / 2;

  const dx = to_cx - from_cx;
  const dy = to_cy - from_cy;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? "right" : "left";
  }
  return dy > 0 ? "bottom" : "top";
}

export function build_edge_path(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const curve_strength = Math.min(dist * 0.3, 80);

  const from_dir = get_direction(from, to);
  const to_dir = get_direction(to, from);

  const cp1 = offset_point(from, from_dir, curve_strength);
  const cp2 = offset_point(to, to_dir, curve_strength);

  return `M ${from.x} ${from.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${to.x} ${to.y}`;
}

function get_direction(from: Point, to: Point): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return { x: Math.sign(dx), y: 0 };
  }
  return { x: 0, y: Math.sign(dy) };
}

function offset_point(
  point: Point,
  dir: { x: number; y: number },
  distance: number,
): Point {
  return {
    x: point.x + dir.x * distance,
    y: point.y + dir.y * distance,
  };
}

export function build_arrow_head(
  to: Point,
  from: Point,
  size: number = 8,
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = Math.atan2(dy, dx);

  const tip = to;
  const left = {
    x: tip.x - size * Math.cos(angle - Math.PI / 6),
    y: tip.y - size * Math.sin(angle - Math.PI / 6),
  };
  const right = {
    x: tip.x - size * Math.cos(angle + Math.PI / 6),
    y: tip.y - size * Math.sin(angle + Math.PI / 6),
  };

  return `M ${left.x} ${left.y} L ${tip.x} ${tip.y} L ${right.x} ${right.y}`;
}
