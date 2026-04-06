import { describe, expect, it } from "vitest";
import { merge_suggestions } from "$lib/features/links/domain/merge_suggestions";
import { as_note_path } from "$lib/shared/types/ids";
import type { NoteMeta } from "$lib/shared/types/note";

function note(path: string): NoteMeta {
  return {
    id: as_note_path(path),
    path: as_note_path(path),
    name: path.split("/").pop()?.replace(".md", "") ?? "",
    title: path.split("/").pop()?.replace(".md", "") ?? "",
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: null,
  };
}

describe("merge_suggestions", () => {
  it("returns empty when both sources are empty", () => {
    const result = merge_suggestions([], [], 0.5, 10);
    expect(result).toEqual([]);
  });

  it("converts semantic hits to suggestions with semantic_similarity provenance", () => {
    const result = merge_suggestions(
      [{ note: note("a.md"), distance: 0.2 }],
      [],
      0.0,
      10,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.note.path).toBe("a.md");
    expect(result[0]?.similarity).toBeCloseTo(0.8, 5);
    expect(result[0]?.rules).toEqual([
      { ruleId: "semantic_similarity", rawScore: expect.closeTo(0.8, 5) },
    ]);
  });

  it("filters semantic hits below similarity threshold", () => {
    const result = merge_suggestions(
      [
        { note: note("close.md"), distance: 0.3 },
        { note: note("border.md"), distance: 0.5 },
        { note: note("far.md"), distance: 0.8 },
      ],
      [],
      0.5,
      10,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.note.path).toBe("close.md");
  });

  it("excludes semantic hits exactly at threshold (requires strictly greater)", () => {
    const result = merge_suggestions(
      [{ note: note("exact.md"), distance: 0.5 }],
      [],
      0.5,
      10,
    );

    expect(result).toHaveLength(0);
  });

  it("converts smart suggestions to suggested links", () => {
    const result = merge_suggestions(
      [],
      [
        {
          targetPath: "tagged.md",
          targetTitle: "Tagged",
          score: 0.6,
          rules: [{ ruleId: "shared_tag", rawScore: 0.6 }],
        },
      ],
      0.0,
      10,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.note.path).toBe("tagged.md");
    expect(result[0]?.similarity).toBe(0.6);
    expect(result[0]?.rules).toEqual([{ ruleId: "shared_tag", rawScore: 0.6 }]);
  });

  it("preserves multi-rule results from a single smart suggestion", () => {
    const result = merge_suggestions(
      [],
      [
        {
          targetPath: "multi.md",
          targetTitle: "Multi",
          score: 0.75,
          rules: [
            { ruleId: "shared_tag", rawScore: 0.5 },
            { ruleId: "same_day", rawScore: 0.3 },
            { ruleId: "semantic_similarity", rawScore: 0.7 },
          ],
        },
      ],
      0.0,
      10,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.rules).toHaveLength(3);
    expect(result[0]?.rules?.map((r) => r.ruleId)).toEqual([
      "shared_tag",
      "same_day",
      "semantic_similarity",
    ]);
  });

  it("deduplicates by path when same note in both sources", () => {
    const result = merge_suggestions(
      [{ note: note("shared.md"), distance: 0.3 }],
      [
        {
          targetPath: "shared.md",
          targetTitle: "Shared",
          score: 0.5,
          rules: [{ ruleId: "shared_tag", rawScore: 0.5 }],
        },
      ],
      0.0,
      10,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.note.path).toBe("shared.md");
  });

  it("takes max similarity when merging duplicate paths", () => {
    const result = merge_suggestions(
      [{ note: note("shared.md"), distance: 0.3 }],
      [
        {
          targetPath: "shared.md",
          targetTitle: "Shared",
          score: 0.9,
          rules: [{ ruleId: "shared_tag", rawScore: 0.9 }],
        },
      ],
      0.0,
      10,
    );

    expect(result[0]?.similarity).toBe(0.9);
  });

  it("deduplicates semantic_similarity rule when present in both sources", () => {
    const result = merge_suggestions(
      [{ note: note("overlap.md"), distance: 0.2 }],
      [
        {
          targetPath: "overlap.md",
          targetTitle: "Overlap",
          score: 0.75,
          rules: [
            { ruleId: "semantic_similarity", rawScore: 0.65 },
            { ruleId: "shared_tag", rawScore: 0.5 },
          ],
        },
      ],
      0.0,
      10,
    );

    expect(result).toHaveLength(1);
    const rules = result[0]?.rules ?? [];
    const semantic_rules = rules.filter(
      (r) => r.ruleId === "semantic_similarity",
    );
    expect(semantic_rules).toHaveLength(1);
    expect(semantic_rules[0]?.rawScore).toBeCloseTo(0.8, 5);
  });

  it("keeps higher rawScore when deduplicating rules", () => {
    const result = merge_suggestions(
      [{ note: note("a.md"), distance: 0.1 }],
      [
        {
          targetPath: "a.md",
          targetTitle: "A",
          score: 0.5,
          rules: [{ ruleId: "semantic_similarity", rawScore: 0.5 }],
        },
      ],
      0.0,
      10,
    );

    const rules = result[0]?.rules ?? [];
    const semantic = rules.find((r) => r.ruleId === "semantic_similarity");
    expect(semantic?.rawScore).toBeCloseTo(0.9, 5);
  });

  it("combines rules from both sources after dedup", () => {
    const result = merge_suggestions(
      [{ note: note("a.md"), distance: 0.25 }],
      [
        {
          targetPath: "a.md",
          targetTitle: "A",
          score: 0.6,
          rules: [
            { ruleId: "semantic_similarity", rawScore: 0.55 },
            { ruleId: "shared_tag", rawScore: 0.4 },
            { ruleId: "title_overlap", rawScore: 0.3 },
          ],
        },
      ],
      0.0,
      10,
    );

    const rule_ids = result[0]?.rules?.map((r) => r.ruleId) ?? [];
    expect(rule_ids).toContain("semantic_similarity");
    expect(rule_ids).toContain("shared_tag");
    expect(rule_ids).toContain("title_overlap");
    expect(rule_ids).toHaveLength(3);
  });

  it("sorts results by descending similarity", () => {
    const result = merge_suggestions(
      [
        { note: note("low.md"), distance: 0.4 },
        { note: note("high.md"), distance: 0.1 },
        { note: note("mid.md"), distance: 0.25 },
      ],
      [],
      0.0,
      10,
    );

    expect(result.map((s) => s.note.path)).toEqual([
      "high.md",
      "mid.md",
      "low.md",
    ]);
  });

  it("enforces limit on output", () => {
    const result = merge_suggestions(
      [
        { note: note("a.md"), distance: 0.1 },
        { note: note("b.md"), distance: 0.2 },
        { note: note("c.md"), distance: 0.3 },
      ],
      [],
      0.0,
      2,
    );

    expect(result).toHaveLength(2);
    expect(result[0]?.note.path).toBe("a.md");
    expect(result[1]?.note.path).toBe("b.md");
  });

  it("ranks multi-rule matches above single-rule when score is higher", () => {
    const result = merge_suggestions(
      [],
      [
        {
          targetPath: "single.md",
          targetTitle: "Single",
          score: 0.4,
          rules: [{ ruleId: "same_day", rawScore: 0.4 }],
        },
        {
          targetPath: "multi.md",
          targetTitle: "Multi",
          score: 0.8,
          rules: [
            { ruleId: "shared_tag", rawScore: 0.5 },
            { ruleId: "semantic_similarity", rawScore: 0.7 },
          ],
        },
      ],
      0.0,
      10,
    );

    expect(result[0]?.note.path).toBe("multi.md");
    expect(result[1]?.note.path).toBe("single.md");
  });

  it("handles smart suggestions below threshold via score (no filtering on smart)", () => {
    const result = merge_suggestions(
      [],
      [
        {
          targetPath: "low-score.md",
          targetTitle: "Low",
          score: 0.1,
          rules: [{ ruleId: "same_day", rawScore: 0.1 }],
        },
      ],
      0.5,
      10,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.note.path).toBe("low-score.md");
  });

  it("handles mixed sources with limit truncation preserving top scores", () => {
    const result = merge_suggestions(
      [
        { note: note("semantic-top.md"), distance: 0.05 },
        { note: note("semantic-low.md"), distance: 0.45 },
      ],
      [
        {
          targetPath: "smart-mid.md",
          targetTitle: "Smart Mid",
          score: 0.7,
          rules: [{ ruleId: "shared_tag", rawScore: 0.7 }],
        },
      ],
      0.0,
      2,
    );

    expect(result).toHaveLength(2);
    expect(result[0]?.note.path).toBe("semantic-top.md");
    expect(result[1]?.note.path).toBe("smart-mid.md");
  });

  it("generates correct NoteMeta from smart suggestion target path", () => {
    const result = merge_suggestions(
      [],
      [
        {
          targetPath: "folder/sub/my note.md",
          targetTitle: "My Note",
          score: 0.6,
          rules: [{ ruleId: "shared_tag", rawScore: 0.6 }],
        },
      ],
      0.0,
      10,
    );

    expect(result[0]?.note.path).toBe("folder/sub/my note.md");
    expect(result[0]?.note.name).toBe("my note");
  });
});
