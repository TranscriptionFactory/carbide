import { describe, it, expect } from "vitest";
import {
  sort_search_graph_nodes,
  compare_search_graph_nodes,
} from "$lib/features/graph/domain/sort_search_graph_nodes";
import type { SearchGraphNode } from "$lib/features/graph/ports";

function node(
  path: string,
  kind: "hit" | "neighbor",
  fields: Partial<SearchGraphNode> = {},
): SearchGraphNode {
  return { path, title: path, kind, ...fields };
}

describe("sort_search_graph_nodes", () => {
  const nodes: SearchGraphNode[] = [
    node("n1.md", "neighbor", {
      score: 0.2,
      date_created_ms: 100,
      date_modified_ms: 100,
    }),
    node("h2.md", "hit", {
      score: 0.9,
      date_created_ms: 300,
      date_modified_ms: 300,
    }),
    node("h1.md", "hit", {
      score: 0.5,
      date_created_ms: 200,
      date_modified_ms: 200,
    }),
    node("n2.md", "neighbor", {
      score: 0.7,
      date_created_ms: 400,
      date_modified_ms: 400,
    }),
  ];

  it("keeps hits before neighbors regardless of direction", () => {
    const desc = sort_search_graph_nodes(nodes, "relevance", false);
    const asc = sort_search_graph_nodes(nodes, "relevance", true);
    expect(desc.map((n) => n.kind)).toEqual([
      "hit",
      "hit",
      "neighbor",
      "neighbor",
    ]);
    expect(asc.map((n) => n.kind)).toEqual([
      "hit",
      "hit",
      "neighbor",
      "neighbor",
    ]);
  });

  it("descending relevance orders each group by score high to low", () => {
    const desc = sort_search_graph_nodes(nodes, "relevance", false);
    expect(desc.map((n) => n.path)).toEqual([
      "h2.md",
      "h1.md",
      "n2.md",
      "n1.md",
    ]);
  });

  it("ascending reverses the secondary ordering within each group", () => {
    const asc = sort_search_graph_nodes(nodes, "relevance", true);
    expect(asc.map((n) => n.path)).toEqual([
      "h1.md",
      "h2.md",
      "n1.md",
      "n2.md",
    ]);
  });

  it("asc and desc are exact mirrors of each other per group", () => {
    const desc = sort_search_graph_nodes(nodes, "date_modified", false);
    const asc = sort_search_graph_nodes(nodes, "date_modified", true);
    const desc_hits = desc.filter((n) => n.kind === "hit").map((n) => n.path);
    const asc_hits = asc.filter((n) => n.kind === "hit").map((n) => n.path);
    const desc_neighbors = desc
      .filter((n) => n.kind === "neighbor")
      .map((n) => n.path);
    const asc_neighbors = asc
      .filter((n) => n.kind === "neighbor")
      .map((n) => n.path);
    expect(asc_hits).toEqual([...desc_hits].reverse());
    expect(asc_neighbors).toEqual([...desc_neighbors].reverse());
  });

  it("name mode sorts alphabetically with direction", () => {
    const named: SearchGraphNode[] = [
      node("c.md", "hit", { title: "Charlie" }),
      node("a.md", "hit", { title: "Alpha" }),
      node("b.md", "hit", { title: "Bravo" }),
    ];
    expect(
      sort_search_graph_nodes(named, "name", true).map((n) => n.title),
    ).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(
      sort_search_graph_nodes(named, "name", false).map((n) => n.title),
    ).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("does not mutate the input array", () => {
    const input = [...nodes];
    sort_search_graph_nodes(input, "relevance", false);
    expect(input.map((n) => n.path)).toEqual(nodes.map((n) => n.path));
  });

  it("comparator returns 0 for identical secondary keys", () => {
    const a = node("a.md", "hit", { score: 0.5 });
    const b = node("b.md", "hit", { score: 0.5 });
    expect(compare_search_graph_nodes(a, b, "relevance", false)).toBeCloseTo(
      0,
      10,
    );
  });
});
