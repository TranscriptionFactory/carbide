import { describe, it, expect } from "vitest";
import {
  extract_search_subgraph,
  compute_auto_expanded_ids,
  type SearchSubgraphHit,
} from "$lib/features/graph/domain/search_subgraph";
import type { VaultGraphSnapshot } from "$lib/features/graph/ports";
import type { SemanticEdge, SmartLinkEdge } from "$lib/features/graph/ports";

function make_vault(
  nodes: { path: string; title: string }[],
  edges: { source: string; target: string }[],
): VaultGraphSnapshot {
  return {
    nodes: nodes.map((n) => ({ path: n.path, title: n.title })),
    edges: edges.map((e) => ({ source: e.source, target: e.target })),
    stats: {
      node_count: nodes.length,
      edge_count: edges.length,
    },
  };
}

describe("extract_search_subgraph", () => {
  it("returns only hit nodes when there are no edges", () => {
    const hits: SearchSubgraphHit[] = [
      { path: "a.md", title: "A", snippet: "match A", score: 1 },
      { path: "b.md", title: "B", snippet: "match B", score: 0.8 },
    ];
    const vault = make_vault(
      [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
        { path: "c.md", title: "C" },
      ],
      [],
    );

    const result = extract_search_subgraph(hits, vault);

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.every((n) => n.kind === "hit")).toBe(true);
    expect(result.edges).toHaveLength(0);
    expect(result.stats.hit_count).toBe(2);
    expect(result.stats.neighbor_count).toBe(0);
  });

  it("collects 1-hop wiki-link neighbors", () => {
    const hits: SearchSubgraphHit[] = [{ path: "a.md", title: "A", score: 1 }];
    const vault = make_vault(
      [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
        { path: "c.md", title: "C" },
        { path: "d.md", title: "D" },
      ],
      [
        { source: "a.md", target: "b.md" },
        { source: "c.md", target: "a.md" },
        { source: "b.md", target: "d.md" },
      ],
    );

    const result = extract_search_subgraph(hits, vault);

    const paths = result.nodes.map((n) => n.path);
    expect(paths).toContain("a.md");
    expect(paths).toContain("b.md");
    expect(paths).toContain("c.md");
    expect(paths).not.toContain("d.md");

    expect(result.nodes.find((n) => n.path === "a.md")?.kind).toBe("hit");
    expect(result.nodes.find((n) => n.path === "b.md")?.kind).toBe("neighbor");
    expect(result.nodes.find((n) => n.path === "c.md")?.kind).toBe("neighbor");

    expect(result.stats.hit_count).toBe(1);
    expect(result.stats.neighbor_count).toBe(2);
  });

  it("includes wiki edges between selected nodes", () => {
    const hits: SearchSubgraphHit[] = [
      { path: "a.md", title: "A", score: 1 },
      { path: "b.md", title: "B", score: 0.9 },
    ];
    const vault = make_vault(
      [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
      ],
      [{ source: "a.md", target: "b.md" }],
    );

    const result = extract_search_subgraph(hits, vault);

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toEqual({
      source: "a.md",
      target: "b.md",
      edge_type: "wiki",
    });
    expect(result.stats.wiki_edge_count).toBe(1);
  });

  it("caps neighbors at max_neighbors", () => {
    const hits: SearchSubgraphHit[] = [
      { path: "center.md", title: "Center", score: 1 },
    ];

    const nodes = [{ path: "center.md", title: "Center" }];
    const edges: { source: string; target: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const path = `n${i}.md`;
      nodes.push({ path, title: `N${i}` });
      edges.push({ source: "center.md", target: path });
    }
    const vault = make_vault(nodes, edges);

    const result = extract_search_subgraph(hits, vault, undefined, undefined, {
      max_neighbors: 3,
    });

    const neighbors = result.nodes.filter((n) => n.kind === "neighbor");
    expect(neighbors).toHaveLength(3);
    expect(result.stats.neighbor_count).toBe(3);
  });

  it("ranks neighbors by connectivity to hits", () => {
    const hits: SearchSubgraphHit[] = [
      { path: "h1.md", title: "H1", score: 1 },
      { path: "h2.md", title: "H2", score: 0.9 },
    ];
    const vault = make_vault(
      [
        { path: "h1.md", title: "H1" },
        { path: "h2.md", title: "H2" },
        { path: "bridge.md", title: "Bridge" },
        { path: "leaf.md", title: "Leaf" },
      ],
      [
        { source: "h1.md", target: "bridge.md" },
        { source: "h2.md", target: "bridge.md" },
        { source: "h1.md", target: "leaf.md" },
      ],
    );

    const result = extract_search_subgraph(hits, vault, undefined, undefined, {
      max_neighbors: 1,
    });

    const neighbors = result.nodes.filter((n) => n.kind === "neighbor");
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0]!.path).toBe("bridge.md");
  });

  it("includes semantic edges when both endpoints are selected", () => {
    const hits: SearchSubgraphHit[] = [
      { path: "a.md", title: "A", score: 1 },
      { path: "b.md", title: "B", score: 0.9 },
    ];
    const vault = make_vault(
      [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
        { path: "c.md", title: "C" },
      ],
      [],
    );
    const semantic: SemanticEdge[] = [
      { source: "a.md", target: "b.md", distance: 0.1 },
      { source: "a.md", target: "c.md", distance: 0.2 },
    ];

    const result = extract_search_subgraph(hits, vault, semantic);

    const sem_edges = result.edges.filter((e) => e.edge_type === "semantic");
    expect(sem_edges).toHaveLength(1);
    expect(sem_edges[0]!.source).toBe("a.md");
    expect(sem_edges[0]!.target).toBe("b.md");
    expect(result.stats.semantic_edge_count).toBe(1);
  });

  it("includes smart link edges when both endpoints are selected", () => {
    const hits: SearchSubgraphHit[] = [
      { path: "a.md", title: "A", score: 1 },
      { path: "b.md", title: "B", score: 0.9 },
    ];
    const vault = make_vault(
      [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
      ],
      [],
    );
    const smart: SmartLinkEdge[] = [
      { source: "a.md", target: "b.md", score: 0.95, rules: [] },
    ];

    const result = extract_search_subgraph(hits, vault, undefined, smart);

    const sl_edges = result.edges.filter((e) => e.edge_type === "smart_link");
    expect(sl_edges).toHaveLength(1);
    expect(result.stats.smart_link_edge_count).toBe(1);
  });

  it("preserves hit snippet and score", () => {
    const hits: SearchSubgraphHit[] = [
      { path: "a.md", title: "A", snippet: "found here", score: 0.75 },
    ];
    const vault = make_vault([{ path: "a.md", title: "A" }], []);

    const result = extract_search_subgraph(hits, vault);

    expect(result.nodes[0]!.snippet).toBe("found here");
    expect(result.nodes[0]!.score).toBe(0.75);
  });

  it("handles empty hits gracefully", () => {
    const vault = make_vault([{ path: "a.md", title: "A" }], []);

    const result = extract_search_subgraph([], vault);

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.stats.hit_count).toBe(0);
    expect(result.stats.neighbor_count).toBe(0);
  });
});

describe("compute_auto_expanded_ids", () => {
  it("returns neighbors connected to 2+ hits", () => {
    const snapshot = extract_search_subgraph(
      [
        { path: "h1.md", title: "H1", score: 1 },
        { path: "h2.md", title: "H2", score: 0.9 },
      ],
      make_vault(
        [
          { path: "h1.md", title: "H1" },
          { path: "h2.md", title: "H2" },
          { path: "bridge.md", title: "Bridge" },
          { path: "leaf.md", title: "Leaf" },
        ],
        [
          { source: "h1.md", target: "bridge.md" },
          { source: "h2.md", target: "bridge.md" },
          { source: "h1.md", target: "leaf.md" },
        ],
      ),
    );

    const auto = compute_auto_expanded_ids(snapshot);

    expect(auto.has("bridge.md")).toBe(true);
    expect(auto.has("leaf.md")).toBe(false);
  });

  it("returns empty set when no neighbors bridge multiple hits", () => {
    const snapshot = extract_search_subgraph(
      [{ path: "h1.md", title: "H1", score: 1 }],
      make_vault(
        [
          { path: "h1.md", title: "H1" },
          { path: "n.md", title: "N" },
        ],
        [{ source: "h1.md", target: "n.md" }],
      ),
    );

    const auto = compute_auto_expanded_ids(snapshot);
    expect(auto.size).toBe(0);
  });
});
