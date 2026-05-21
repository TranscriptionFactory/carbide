import { describe, it, expect } from "vitest";
import { matches_filter } from "$lib/features/graph/domain/graph_filter";

describe("matches_filter", () => {
  it("returns true for empty query", () => {
    expect(matches_filter("", "Note Title", "notes/foo.md")).toBe(true);
  });

  it("matches exact substring in label", () => {
    expect(matches_filter("Title", "Note Title", "notes/foo.md")).toBe(true);
  });

  it("matches exact substring in id", () => {
    expect(matches_filter("foo", "Note Title", "notes/foo.md")).toBe(true);
  });

  it("matches with fuzzy typo in label", () => {
    expect(matches_filter("Ttle", "Note Title", "notes/foo.md")).toBe(true);
  });

  it("matches with fuzzy typo in id", () => {
    expect(matches_filter("ntes/fo", "Unrelated", "notes/foo.md")).toBe(true);
  });

  it("returns false for non-matching query", () => {
    expect(matches_filter("zzzzz", "Note Title", "notes/foo.md")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(matches_filter("note title", "Note Title", "notes/foo.md")).toBe(
      true,
    );
  });
});
