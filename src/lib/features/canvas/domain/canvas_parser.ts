import type { CanvasData, CanvasEdge, CanvasNode } from "./canvas_types";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("canvas_parser");

export type ParseResult =
  | { ok: true; data: CanvasData }
  | { ok: false; error: string };

const VALID_NODE_TYPES = new Set(["text", "file", "link", "group"]);
const VALID_SIDES = new Set(["top", "right", "bottom", "left"]);
const VALID_ENDS = new Set(["none", "arrow"]);

export function parse_canvas(json_string: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json_string);
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Canvas must be a JSON object" };
  }

  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.nodes)) {
    return { ok: false, error: "Missing or invalid 'nodes' array" };
  }

  if (!Array.isArray(obj.edges)) {
    return { ok: false, error: "Missing or invalid 'edges' array" };
  }

  const nodes: CanvasNode[] = [];
  for (const node of obj.nodes) {
    const result = validate_node(node);
    if (result) nodes.push(result);
  }

  const edges: CanvasEdge[] = [];
  for (const edge of obj.edges) {
    const result = validate_edge(edge);
    if (result) edges.push(result);
  }

  const { nodes: _n, edges: _e, ...rest } = obj;

  return { ok: true, data: { nodes, edges, ...rest } };
}

export function serialize_canvas(data: CanvasData): string {
  return JSON.stringify(data, null, "\t");
}

function validate_node(raw: unknown): CanvasNode | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const node = raw as Record<string, unknown>;

  if (typeof node.id !== "string") return null;
  if (typeof node.x !== "number") return null;
  if (typeof node.y !== "number") return null;
  if (typeof node.width !== "number") return null;
  if (typeof node.height !== "number") return null;

  const type = node.type;
  if (typeof type !== "string") return null;

  if (!VALID_NODE_TYPES.has(type)) {
    log.warn(
      `Unknown canvas node type: "${type}" (id: ${node.id}). Rendering as placeholder.`,
    );
    return {
      ...(node as any),
      type: "text",
      text: `[Unknown node type: ${type}]`,
    } as CanvasNode;
  }

  if (type === "text" && typeof node.text !== "string") return null;
  if (type === "file" && typeof node.file !== "string") return null;
  if (type === "link" && typeof node.url !== "string") return null;

  return raw as CanvasNode;
}

function validate_edge(raw: unknown): CanvasEdge | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const edge = raw as Record<string, unknown>;

  if (typeof edge.id !== "string") return null;
  if (typeof edge.fromNode !== "string") return null;
  if (typeof edge.toNode !== "string") return null;

  if (edge.fromSide !== undefined && !VALID_SIDES.has(edge.fromSide as string))
    return null;
  if (edge.toSide !== undefined && !VALID_SIDES.has(edge.toSide as string))
    return null;
  if (edge.fromEnd !== undefined && !VALID_ENDS.has(edge.fromEnd as string))
    return null;
  if (edge.toEnd !== undefined && !VALID_ENDS.has(edge.toEnd as string))
    return null;

  return raw as CanvasEdge;
}
