import { describe, it, expect } from "vitest";
import {
  create_vault_graph_simulation,
  stabilize_simulation,
  resolve_vault_graph_view,
} from "$lib/features/graph/domain/vault_graph_layout";
import type { VaultGraphSnapshot } from "$lib/features/graph/ports";

function make_snapshot(
  nodes: { path: string; title: string }[],
  edges: { source: string; target: string }[],
): VaultGraphSnapshot {
  return {
    nodes,
    edges,
    stats: { node_count: nodes.length, edge_count: edges.length },
  };
}

describe("create_vault_graph_simulation", () => {
  it("creates simulation with correct node and edge count", () => {
    const snapshot = make_snapshot(
      [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
        { path: "c.md", title: "C" },
      ],
      [
        { source: "a.md", target: "b.md" },
        { source: "b.md", target: "c.md" },
      ],
    );

    const state = create_vault_graph_simulation(snapshot);
    expect(state.nodes).toHaveLength(3);
    expect(state.edges).toHaveLength(2);
  });

  it("filters edges with invalid endpoints", () => {
    const snapshot = make_snapshot(
      [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
      ],
      [
        { source: "a.md", target: "b.md" },
        { source: "a.md", target: "nonexistent.md" },
      ],
    );

    const state = create_vault_graph_simulation(snapshot);
    expect(state.edges).toHaveLength(1);
  });

  it("handles empty snapshot", () => {
    const snapshot = make_snapshot([], []);
    const state = create_vault_graph_simulation(snapshot);
    expect(state.nodes).toHaveLength(0);
    expect(state.edges).toHaveLength(0);
  });
});

describe("stabilize_simulation", () => {
  it("produces finite positions after stabilization", () => {
    const snapshot = make_snapshot(
      [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
        { path: "c.md", title: "C" },
      ],
      [
        { source: "a.md", target: "b.md" },
        { source: "b.md", target: "c.md" },
        { source: "c.md", target: "a.md" },
      ],
    );

    const state = create_vault_graph_simulation(snapshot);
    stabilize_simulation(state, 300);

    for (const node of state.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });

  it("spreads nodes across both axes without collapsing to a line", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({
      path: `n${i}.md`,
      title: `N${i}`,
    }));
    const edges = nodes.slice(1).map((n) => ({
      source: "n0.md",
      target: n.path,
    }));
    const snapshot = make_snapshot(nodes, edges);

    const state = create_vault_graph_simulation(snapshot);
    stabilize_simulation(state, 300);

    const ys = state.nodes.map((n) => n.y ?? 0);
    const mean_y = ys.reduce((a, b) => a + b, 0) / ys.length;
    const variance_y =
      ys.reduce((a, y) => a + (y - mean_y) ** 2, 0) / ys.length;

    expect(variance_y).toBeGreaterThan(100);
  });

  it("produces distinct positions for connected nodes", () => {
    const snapshot = make_snapshot(
      [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
      ],
      [{ source: "a.md", target: "b.md" }],
    );

    const state = create_vault_graph_simulation(snapshot);
    stabilize_simulation(state, 300);

    const a = state.nodes[0]!;
    const b = state.nodes[1]!;
    const same_position = a.x === b.x && a.y === b.y;
    expect(same_position).toBe(false);
  });
});

describe("resolve_vault_graph_view", () => {
  it("returns empty view for empty state", () => {
    const state = create_vault_graph_simulation(make_snapshot([], []));
    stabilize_simulation(state);

    const view = resolve_vault_graph_view({
      state,
      filter_query: "",
      selected_node_ids: [],
      hovered_node_id: null,
    });

    expect(view.nodes).toHaveLength(0);
    expect(view.edges).toHaveLength(0);
  });

  it("marks matching nodes as not dimmed and non-matching as dimmed", () => {
    const snapshot = make_snapshot(
      [
        { path: "alpha.md", title: "Alpha" },
        { path: "beta.md", title: "Beta" },
        { path: "gamma.md", title: "Gamma" },
      ],
      [],
    );

    const state = create_vault_graph_simulation(snapshot);
    stabilize_simulation(state);

    const view = resolve_vault_graph_view({
      state,
      filter_query: "Alpha",
      selected_node_ids: [],
      hovered_node_id: null,
    });

    const alpha = view.nodes.find((n) => n.id === "alpha.md");
    const beta = view.nodes.find((n) => n.id === "beta.md");
    expect(alpha?.dimmed).toBe(false);
    expect(beta?.dimmed).toBe(true);
  });

  it("marks selected node correctly", () => {
    const snapshot = make_snapshot([{ path: "a.md", title: "A" }], []);

    const state = create_vault_graph_simulation(snapshot);
    stabilize_simulation(state);

    const view = resolve_vault_graph_view({
      state,
      filter_query: "",
      selected_node_ids: ["a.md"],
      hovered_node_id: null,
    });

    expect(view.nodes[0]!.selected).toBe(true);
  });

  it("marks hovered node and connected nodes", () => {
    const snapshot = make_snapshot(
      [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
        { path: "c.md", title: "C" },
      ],
      [{ source: "a.md", target: "b.md" }],
    );

    const state = create_vault_graph_simulation(snapshot);
    stabilize_simulation(state);

    const view = resolve_vault_graph_view({
      state,
      filter_query: "",
      selected_node_ids: [],
      hovered_node_id: "a.md",
    });

    const a = view.nodes.find((n) => n.id === "a.md");
    const b = view.nodes.find((n) => n.id === "b.md");
    const c = view.nodes.find((n) => n.id === "c.md");
    expect(a?.hovered).toBe(true);
    expect(b?.connected_to_hovered).toBe(true);
    expect(c?.connected_to_hovered).toBe(false);
  });

  it("highlights edges connected to hovered node", () => {
    const snapshot = make_snapshot(
      [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
        { path: "c.md", title: "C" },
      ],
      [
        { source: "a.md", target: "b.md" },
        { source: "b.md", target: "c.md" },
      ],
    );

    const state = create_vault_graph_simulation(snapshot);
    stabilize_simulation(state);

    const view = resolve_vault_graph_view({
      state,
      filter_query: "",
      selected_node_ids: [],
      hovered_node_id: "a.md",
    });

    const ab_edge = view.edges.find(
      (e) => e.id.includes("a.md") && e.id.includes("b.md"),
    );
    const bc_edge = view.edges.find(
      (e) => e.id.includes("b.md") && e.id.includes("c.md"),
    );
    expect(ab_edge).toBeDefined();
    expect(ab_edge!.highlighted).toBe(true);
    expect(bc_edge).toBeDefined();
    expect(bc_edge!.highlighted).toBe(false);
  });

  it("no nodes are dimmed when filter is empty", () => {
    const snapshot = make_snapshot(
      [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
      ],
      [],
    );

    const state = create_vault_graph_simulation(snapshot);
    stabilize_simulation(state);

    const view = resolve_vault_graph_view({
      state,
      filter_query: "",
      selected_node_ids: [],
      hovered_node_id: null,
    });

    expect(view.nodes.every((n) => !n.dimmed)).toBe(true);
  });
});
