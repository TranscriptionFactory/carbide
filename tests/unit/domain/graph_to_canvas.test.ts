import { describe, it, expect } from "vitest";
import {
  graph_to_canvas,
  type GraphToCanvasInput,
} from "$lib/features/graph/domain/graph_to_canvas";

describe("graph_to_canvas", () => {
  it("returns empty canvas for empty input", () => {
    const result = graph_to_canvas({
      nodes: [],
      edges: [],
      layout: "column",
    });
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  describe("column layout", () => {
    const input: GraphToCanvasInput = {
      nodes: [
        { path: "center.md", title: "Center" },
        { path: "backlink.md", title: "Backlink" },
        { path: "outlink.md", title: "Outlink" },
      ],
      edges: [
        { source: "backlink.md", target: "center.md" },
        { source: "center.md", target: "outlink.md" },
      ],
      layout: "column",
      center_path: "center.md",
    };

    it("creates canvas nodes for all graph nodes", () => {
      const result = graph_to_canvas(input);
      expect(result.nodes).toHaveLength(3);
    });

    it("places center node in the middle column", () => {
      const result = graph_to_canvas(input);
      const center = result.nodes.find(
        (n) => n.type === "file" && n.file === "center.md",
      );
      const left = result.nodes.find(
        (n) => n.type === "file" && n.file === "backlink.md",
      );
      const right = result.nodes.find(
        (n) => n.type === "file" && n.file === "outlink.md",
      );
      expect(center).toBeDefined();
      expect(left).toBeDefined();
      expect(right).toBeDefined();
      if (!center || !left || !right) return;
      expect(center.x).toBeGreaterThan(left.x);
      expect(center.x).toBeLessThan(right.x);
    });

    it("maps edges to canvas edges with arrows", () => {
      const result = graph_to_canvas(input);
      expect(result.edges).toHaveLength(2);
      for (const edge of result.edges) {
        expect(edge.toEnd).toBe("arrow");
      }
    });

    it("preserves edge labels", () => {
      const input_with_labels: GraphToCanvasInput = {
        nodes: [
          { path: "a.md", title: "A" },
          { path: "b.md", title: "B" },
        ],
        edges: [{ source: "a.md", target: "b.md", label: "related" }],
        layout: "column",
        center_path: "a.md",
      };
      const result = graph_to_canvas(input_with_labels);
      expect(result.edges[0]?.label).toBe("related");
    });

    it("uses first node as center when center_path not specified", () => {
      const result = graph_to_canvas({
        nodes: [{ path: "only.md", title: "Only" }],
        edges: [],
        layout: "column",
      });
      expect(result.nodes).toHaveLength(1);
      const node = result.nodes[0];
      expect(node?.type).toBe("file");
      if (node?.type === "file") {
        expect(node.file).toBe("only.md");
      }
    });
  });

  describe("radial layout", () => {
    it("creates nodes at radially distributed positions", () => {
      const input: GraphToCanvasInput = {
        nodes: [
          { path: "center.md", title: "Center" },
          { path: "n1.md", title: "N1" },
          { path: "n2.md", title: "N2" },
        ],
        edges: [
          { source: "center.md", target: "n1.md" },
          { source: "center.md", target: "n2.md" },
        ],
        layout: "radial",
        center_path: "center.md",
      };
      const result = graph_to_canvas(input);
      expect(result.nodes).toHaveLength(3);

      // All nodes should have non-negative positions (shifted to positive space)
      for (const node of result.nodes) {
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeGreaterThanOrEqual(0);
      }
    });

    it("creates edges between connected nodes", () => {
      const input: GraphToCanvasInput = {
        nodes: [
          { path: "c.md", title: "C" },
          { path: "a.md", title: "A" },
        ],
        edges: [{ source: "c.md", target: "a.md" }],
        layout: "radial",
        center_path: "c.md",
      };
      const result = graph_to_canvas(input);
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0]?.toEnd).toBe("arrow");
    });

    it("excludes nodes not in radial layout positions", () => {
      const input: GraphToCanvasInput = {
        nodes: [
          { path: "c.md", title: "C" },
          { path: "a.md", title: "A" },
          { path: "isolated.md", title: "Isolated" },
        ],
        edges: [{ source: "c.md", target: "a.md" }],
        layout: "radial",
        center_path: "c.md",
      };
      const result = graph_to_canvas(input);
      // Isolated node has no edge to center, so radial_layout won't give it a position
      expect(result.nodes).toHaveLength(2);
    });
  });

  describe("force layout", () => {
    it("positions all nodes with non-negative coordinates", () => {
      const input: GraphToCanvasInput = {
        nodes: [
          { path: "a.md", title: "A" },
          { path: "b.md", title: "B" },
          { path: "c.md", title: "C" },
        ],
        edges: [
          { source: "a.md", target: "b.md" },
          { source: "b.md", target: "c.md" },
        ],
        layout: "force",
      };
      const result = graph_to_canvas(input);
      expect(result.nodes).toHaveLength(3);
      for (const node of result.nodes) {
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeGreaterThanOrEqual(0);
      }
    });

    it("falls back to column layout when >100 nodes", () => {
      const nodes = Array.from({ length: 101 }, (_, i) => ({
        path: `n${String(i)}.md`,
        title: `N${String(i)}`,
      }));
      const input: GraphToCanvasInput = {
        nodes,
        edges: [{ source: "n0.md", target: "n1.md" }],
        layout: "force",
        center_path: "n0.md",
      };
      const result = graph_to_canvas(input);
      // Should produce a result (column layout fallback)
      expect(result.nodes.length).toBeGreaterThan(0);
    });
  });

  describe("GroupNode generation", () => {
    it("creates group nodes from cluster assignments", () => {
      const input: GraphToCanvasInput = {
        nodes: [
          { path: "a.md", title: "A" },
          { path: "b.md", title: "B" },
          { path: "c.md", title: "C" },
        ],
        edges: [
          { source: "a.md", target: "b.md" },
          { source: "b.md", target: "c.md" },
        ],
        layout: "column",
        center_path: "a.md",
        cluster_assignments: { "a.md": 0, "b.md": 0, "c.md": 1 },
      };
      const result = graph_to_canvas(input);
      const groups = result.nodes.filter((n) => n.type === "group");
      // Cluster 0 has 2 members (a,b) -> group. Cluster 1 has 1 member (c) -> no group
      expect(groups).toHaveLength(1);
      expect(groups[0]?.type === "group" && groups[0].label).toBe("Cluster 0");
    });

    it("group node encompasses member nodes", () => {
      const input: GraphToCanvasInput = {
        nodes: [
          { path: "a.md", title: "A" },
          { path: "b.md", title: "B" },
        ],
        edges: [{ source: "a.md", target: "b.md" }],
        layout: "column",
        center_path: "a.md",
        cluster_assignments: { "a.md": 0, "b.md": 0 },
      };
      const result = graph_to_canvas(input);
      const group = result.nodes.find((n) => n.type === "group");
      const file_nodes = result.nodes.filter((n) => n.type === "file");
      expect(group).toBeDefined();
      if (!group) return;
      for (const fn of file_nodes) {
        expect(fn.x).toBeGreaterThanOrEqual(group.x);
        expect(fn.y).toBeGreaterThanOrEqual(group.y);
        expect(fn.x + fn.width).toBeLessThanOrEqual(group.x + group.width);
        expect(fn.y + fn.height).toBeLessThanOrEqual(group.y + group.height);
      }
    });

    it("produces no groups when no cluster assignments", () => {
      const input: GraphToCanvasInput = {
        nodes: [{ path: "a.md", title: "A" }],
        edges: [],
        layout: "column",
        center_path: "a.md",
      };
      const result = graph_to_canvas(input);
      const groups = result.nodes.filter((n) => n.type === "group");
      expect(groups).toHaveLength(0);
    });
  });
});
