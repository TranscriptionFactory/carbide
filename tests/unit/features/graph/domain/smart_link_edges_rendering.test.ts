import { describe, it, expect } from "vitest";
import { build_smart_link_edges } from "$lib/features/graph/domain/smart_link_edges";
import type { SmartLinkRuleMatchInfo } from "$lib/features/graph/ports";

describe("smart link edges for graph rendering", () => {
  const rules: SmartLinkRuleMatchInfo[] = [
    { rule_id: "shared_tag", raw_score: 0.6 },
    { rule_id: "semantic_similarity", raw_score: 0.4 },
  ];

  it("includes provenance rules on each edge", () => {
    const map = new Map([
      [
        "a.md",
        [
          {
            target_path: "b.md",
            target_title: "B",
            score: 0.5,
            rules,
          },
        ],
      ],
    ]);
    const edges = build_smart_link_edges(map);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.rules).toHaveLength(2);
    expect(edges[0]!.rules[0]!.rule_id).toBe("shared_tag");
    expect(edges[0]!.rules[1]!.rule_id).toBe("semantic_similarity");
  });

  it("carries composite score for rendering opacity", () => {
    const map = new Map([
      [
        "a.md",
        [
          {
            target_path: "b.md",
            target_title: "B",
            score: 0.75,
            rules: [{ rule_id: "same_day", raw_score: 0.75 }],
          },
        ],
      ],
    ]);
    const edges = build_smart_link_edges(map);
    expect(edges[0]!.score).toBe(0.75);
  });

  it("deduplicates bidirectional edges", () => {
    const map = new Map([
      [
        "a.md",
        [
          {
            target_path: "b.md",
            target_title: "B",
            score: 0.5,
            rules,
          },
        ],
      ],
      [
        "b.md",
        [
          {
            target_path: "a.md",
            target_title: "A",
            score: 0.5,
            rules,
          },
        ],
      ],
    ]);
    const edges = build_smart_link_edges(map);
    expect(edges).toHaveLength(1);
  });

  it("filters edges below minimum score", () => {
    const map = new Map([
      [
        "a.md",
        [
          {
            target_path: "b.md",
            target_title: "B",
            score: 0.05,
            rules: [{ rule_id: "same_day", raw_score: 0.05 }],
          },
        ],
      ],
    ]);
    const edges = build_smart_link_edges(map, 0.1);
    expect(edges).toHaveLength(0);
  });
});
