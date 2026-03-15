import { describe, expect, it } from "vitest";
import {
  build_semantic_edges,
  SEMANTIC_EDGE_DISTANCE_THRESHOLD,
} from "$lib/features/graph/domain/semantic_edges";
import type { SemanticSearchHit } from "$lib/shared/types/search";
import { as_note_path } from "$lib/shared/types/ids";

function make_hit(path: string, distance: number): SemanticSearchHit {
  return {
    note: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: path.split("/").at(-1)?.replace(".md", "") ?? path,
      title: path,
      mtime_ms: 0,
      size_bytes: 0,
    },
    distance,
  };
}

describe("build_semantic_edges", () => {
  it("returns empty when results map is empty", () => {
    const edges = build_semantic_edges(new Map());
    expect(edges).toEqual([]);
  });

  it("excludes hits at or above distance threshold", () => {
    const results = new Map([
      [
        "a.md",
        [
          make_hit("b.md", SEMANTIC_EDGE_DISTANCE_THRESHOLD),
          make_hit("c.md", SEMANTIC_EDGE_DISTANCE_THRESHOLD + 0.01),
        ],
      ],
    ]);
    const edges = build_semantic_edges(results);
    expect(edges).toHaveLength(0);
  });

  it("includes hits below distance threshold", () => {
    const results = new Map([["a.md", [make_hit("b.md", 0.3)]]]);
    const edges = build_semantic_edges(results);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "a.md",
      target: "b.md",
      distance: 0.3,
    });
  });

  it("deduplicates A→B and B→A into a single edge", () => {
    const results = new Map([
      ["a.md", [make_hit("b.md", 0.2)]],
      ["b.md", [make_hit("a.md", 0.2)]],
    ]);
    const edges = build_semantic_edges(results);
    expect(edges).toHaveLength(1);
  });

  it("preserves distinct pairs", () => {
    const results = new Map([
      ["a.md", [make_hit("b.md", 0.1), make_hit("c.md", 0.2)]],
      ["b.md", [make_hit("c.md", 0.3)]],
    ]);
    const edges = build_semantic_edges(results);
    expect(edges).toHaveLength(3);
  });

  it("does not create self-edges", () => {
    const results = new Map([["a.md", [make_hit("a.md", 0.0)]]]);
    const edges = build_semantic_edges(results);
    expect(edges).toHaveLength(0);
  });

  it("mixed: some below threshold, some above", () => {
    const results = new Map([
      [
        "a.md",
        [make_hit("b.md", 0.1), make_hit("c.md", 0.6), make_hit("d.md", 0.49)],
      ],
    ]);
    const edges = build_semantic_edges(results);
    expect(edges).toHaveLength(2);
    const paths = edges.map((e) => e.target);
    expect(paths).toContain("b.md");
    expect(paths).toContain("d.md");
    expect(paths).not.toContain("c.md");
  });
});
