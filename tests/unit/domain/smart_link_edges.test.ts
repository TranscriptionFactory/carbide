import { describe, expect, it } from "vitest";
import {
  build_smart_link_edges,
  SMART_LINK_EDGE_MIN_SCORE,
  type SmartLinkSuggestionHit,
} from "$lib/features/graph/domain/smart_link_edges";

function make_suggestion(
  target_path: string,
  score: number,
  rule_ids: string[] = ["shared_tag"],
): SmartLinkSuggestionHit {
  return {
    target_path,
    target_title: target_path.replace(".md", ""),
    score,
    rules: rule_ids.map((id) => ({ rule_id: id, raw_score: score })),
  };
}

describe("build_smart_link_edges", () => {
  it("returns empty when suggestions map is empty", () => {
    const edges = build_smart_link_edges(new Map());
    expect(edges).toEqual([]);
  });

  it("excludes suggestions below min_score", () => {
    const suggestions = new Map([
      [
        "a.md",
        [
          make_suggestion("b.md", SMART_LINK_EDGE_MIN_SCORE - 0.01),
          make_suggestion("c.md", 0.0),
        ],
      ],
    ]);
    const edges = build_smart_link_edges(suggestions);
    expect(edges).toHaveLength(0);
  });

  it("includes suggestions at or above min_score", () => {
    const suggestions = new Map([
      ["a.md", [make_suggestion("b.md", SMART_LINK_EDGE_MIN_SCORE)]],
    ]);
    const edges = build_smart_link_edges(suggestions);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "a.md",
      target: "b.md",
      score: SMART_LINK_EDGE_MIN_SCORE,
    });
  });

  it("preserves rule provenance on edges", () => {
    const suggestions = new Map([
      [
        "a.md",
        [make_suggestion("b.md", 0.5, ["shared_tag", "semantic_similarity"])],
      ],
    ]);
    const edges = build_smart_link_edges(suggestions);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.rules).toHaveLength(2);
    expect(edges[0]!.rules[0]!.rule_id).toBe("shared_tag");
    expect(edges[0]!.rules[1]!.rule_id).toBe("semantic_similarity");
  });

  it("deduplicates A→B and B→A into a single edge", () => {
    const suggestions = new Map([
      ["a.md", [make_suggestion("b.md", 0.5)]],
      ["b.md", [make_suggestion("a.md", 0.4)]],
    ]);
    const edges = build_smart_link_edges(suggestions);
    expect(edges).toHaveLength(1);
  });

  it("preserves distinct pairs", () => {
    const suggestions = new Map([
      ["a.md", [make_suggestion("b.md", 0.5), make_suggestion("c.md", 0.3)]],
      ["b.md", [make_suggestion("c.md", 0.4)]],
    ]);
    const edges = build_smart_link_edges(suggestions);
    expect(edges).toHaveLength(3);
  });

  it("does not create self-edges", () => {
    const suggestions = new Map([["a.md", [make_suggestion("a.md", 1.0)]]]);
    const edges = build_smart_link_edges(suggestions);
    expect(edges).toHaveLength(0);
  });

  it("uses custom min_score threshold", () => {
    const suggestions = new Map([
      ["a.md", [make_suggestion("b.md", 0.3), make_suggestion("c.md", 0.6)]],
    ]);
    const edges = build_smart_link_edges(suggestions, 0.5);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.target).toBe("c.md");
  });

  it("mixed: some below threshold, some above", () => {
    const suggestions = new Map([
      [
        "a.md",
        [
          make_suggestion("b.md", 0.5),
          make_suggestion("c.md", 0.05),
          make_suggestion("d.md", 0.2),
        ],
      ],
    ]);
    const edges = build_smart_link_edges(suggestions);
    expect(edges).toHaveLength(2);
    const targets = edges.map((e) => e.target);
    expect(targets).toContain("b.md");
    expect(targets).toContain("d.md");
    expect(targets).not.toContain("c.md");
  });
});
