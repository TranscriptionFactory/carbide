import { describe, expect, it } from "vitest";
import { rank_tags, score_tag } from "$lib/features/tags/domain/tag_matcher";

describe("score_tag — hierarchical matching", () => {
  it("scores exact match as 'exact' with score 1.0", () => {
    const result = score_tag("projects", "projects");
    expect(result.kind).toBe("exact");
    expect(result.score).toBe(1.0);
  });

  it("scores #parent as hierarchical match against #parent/child", () => {
    const result = score_tag("projects", "projects/carbide");
    expect(result.kind).toBe("hierarchical");
    expect(result.score).toBe(1.0);
  });

  it("scores #parent against #parent/child/grandchild", () => {
    const result = score_tag("projects", "projects/carbide/phase-4");
    expect(result.kind).toBe("hierarchical");
    expect(result.score).toBe(1.0);
  });

  it("ignores a leading # on the query", () => {
    const result = score_tag("#projects", "projects/carbide");
    expect(result.kind).toBe("hierarchical");
    expect(result.score).toBe(1.0);
  });

  it("is case-insensitive on the prefix check", () => {
    const result = score_tag("Projects", "projects/carbide");
    expect(result.kind).toBe("hierarchical");
  });
});

describe("score_tag — fuzzy / typo matching", () => {
  it("matches a typo'd query against the canonical tag", () => {
    const result = score_tag("prjects", "projects");
    expect(result.kind).toBe("fuzzy");
    expect(result.score).toBeGreaterThan(0);
  });

  it("matches against the leaf segment", () => {
    const result = score_tag("carbide", "projects/carbide");
    // 'carbide' substring is inside the full tag → substring beats fuzzy.
    expect(["substring", "fuzzy"]).toContain(result.kind);
    expect(result.score).toBeGreaterThan(0);
  });

  it("returns 0 for an utterly different query", () => {
    const result = score_tag("xyz", "projects/carbide");
    expect(result.score).toBe(0);
  });

  it("never lets a fuzzy match outrank an exact hierarchical match", () => {
    const fuzzy = score_tag("projct", "projct/typo-folder").score;
    const hier = score_tag("projects", "projects/carbide").score;
    expect(hier).toBeGreaterThanOrEqual(fuzzy);
  });
});

describe("rank_tags", () => {
  const tags = [
    "projects",
    "projects/carbide",
    "projects/carbide/phase-4",
    "people",
    "personal",
    "papers/2026/llm",
  ];

  it("returns hierarchical matches ahead of fuzzy ones", () => {
    const ranked = rank_tags("projects", tags);
    expect(ranked[0]!.kind).toBe("exact");
    expect(ranked[0]!.tag).toBe("projects");
    expect(ranked.slice(0, 3).map((r) => r.tag)).toEqual([
      "projects",
      "projects/carbide",
      "projects/carbide/phase-4",
    ]);
  });

  it("recovers from a typo via fuzzy match", () => {
    const ranked = rank_tags("prjects", tags);
    const hit_tags = ranked.map((r) => r.tag);
    expect(hit_tags).toContain("projects");
  });

  it("respects the limit", () => {
    const ranked = rank_tags("p", tags, 2);
    expect(ranked.length).toBe(2);
  });

  it("filters out zero-score matches", () => {
    const ranked = rank_tags("zzzz-unmatched-xxx", tags);
    expect(ranked.length).toBe(0);
  });
});
