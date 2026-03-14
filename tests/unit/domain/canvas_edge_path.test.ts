import { describe, it, expect } from "vitest";
import {
  get_edge_endpoints,
  build_edge_path,
  build_arrow_head,
} from "$lib/features/canvas/domain/canvas_edge_path";
import type { CanvasNode, CanvasEdge } from "$lib/features/canvas/types/canvas";

const NODE_A: CanvasNode = {
  id: "a",
  type: "text",
  text: "A",
  x: 0,
  y: 0,
  width: 200,
  height: 100,
};

const NODE_B: CanvasNode = {
  id: "b",
  type: "text",
  text: "B",
  x: 400,
  y: 0,
  width: 200,
  height: 100,
};

function make_node_map(...nodes: CanvasNode[]): Map<string, CanvasNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

describe("get_edge_endpoints", () => {
  it("returns endpoints for valid edge", () => {
    const edge: CanvasEdge = {
      id: "e1",
      fromNode: "a",
      toNode: "b",
      fromSide: "right",
      toSide: "left",
    };

    const result = get_edge_endpoints(edge, make_node_map(NODE_A, NODE_B));
    expect(result).not.toBeNull();
    expect(result!.from).toEqual({ x: 200, y: 50 });
    expect(result!.to).toEqual({ x: 400, y: 50 });
  });

  it("returns null for missing nodes", () => {
    const edge: CanvasEdge = {
      id: "e1",
      fromNode: "missing",
      toNode: "b",
    };
    expect(get_edge_endpoints(edge, make_node_map(NODE_A, NODE_B))).toBeNull();
  });

  it("auto-detects side when not specified", () => {
    const edge: CanvasEdge = {
      id: "e1",
      fromNode: "a",
      toNode: "b",
    };

    const result = get_edge_endpoints(edge, make_node_map(NODE_A, NODE_B));
    expect(result).not.toBeNull();
    expect(result!.from.x).toBe(200);
    expect(result!.to.x).toBe(400);
  });

  it("handles top/bottom sides", () => {
    const above: CanvasNode = { ...NODE_A, id: "above", y: -200 };
    const below: CanvasNode = { ...NODE_A, id: "below", y: 200 };
    const edge: CanvasEdge = {
      id: "e1",
      fromNode: "above",
      toNode: "below",
      fromSide: "bottom",
      toSide: "top",
    };

    const result = get_edge_endpoints(edge, make_node_map(above, below));
    expect(result!.from.y).toBe(-100);
    expect(result!.to.y).toBe(200);
  });
});

describe("build_edge_path", () => {
  it("returns a valid SVG cubic bezier path", () => {
    const path = build_edge_path({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(path).toMatch(/^M\s/);
    expect(path).toContain("C");
  });
});

describe("build_arrow_head", () => {
  it("returns a valid SVG arrow path", () => {
    const path = build_arrow_head({ x: 100, y: 50 }, { x: 0, y: 50 });
    expect(path).toMatch(/^M\s/);
    expect(path).toContain("L");
  });
});
