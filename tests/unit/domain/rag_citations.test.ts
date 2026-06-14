import { describe, expect, it } from "vitest";
import {
  build_citation_map,
  match_citation_markers,
  resolve_citations,
  type RagCitation,
} from "$lib/features/rag";

const citations: RagCitation[] = [
  { index: 1, note_path: "a.md", title: "A" },
  { index: 2, note_path: "b.md", title: "B" },
];

describe("match_citation_markers", () => {
  it("extracts every bracketed number in order, including adjacent markers", () => {
    expect(match_citation_markers("foo [1] bar [3][2] baz")).toEqual([1, 3, 2]);
  });

  it("returns an empty list when there are no markers", () => {
    expect(match_citation_markers("no citations here")).toEqual([]);
  });
});

describe("resolve_citations", () => {
  const map = build_citation_map(citations);

  it("resolves mapped markers in first-appearance order without duplicates", () => {
    const result = resolve_citations("Per [2] and [1], also [2] again.", map);
    expect(result.map((c) => c.index)).toEqual([2, 1]);
    expect(result[0]?.note_path).toBe("b.md");
  });

  it("drops markers with no matching source (citation faithfulness guard)", () => {
    const result = resolve_citations("Claim [1] and bogus [9].", map);
    expect(result.map((c) => c.index)).toEqual([1]);
  });

  it("returns nothing when the answer cites no sources", () => {
    expect(resolve_citations("I could not find it in the vault.", map)).toEqual(
      [],
    );
  });
});
