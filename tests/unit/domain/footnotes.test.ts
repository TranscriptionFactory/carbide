import { describe, it, expect } from "vitest";
import {
  format_footnote_ref,
  normalize_footnote_label,
  number_footnotes,
  parse_footnote_definition,
} from "$lib/features/editor/domain/footnotes";

describe("parse_footnote_definition", () => {
  it("extracts the label and single-line body", () => {
    expect(parse_footnote_definition("[^note]: The body.")).toEqual({
      label: "note",
      body: "The body.",
    });
  });

  it("strips the continuation indent of multi-line bodies", () => {
    expect(
      parse_footnote_definition("[^1]: line one\n  line two\n    line three"),
    ).toEqual({ label: "1", body: "line one\nline two\nline three" });
  });

  it("rejects text that is not a definition", () => {
    expect(parse_footnote_definition("[^1] not a definition")).toBeNull();
    expect(parse_footnote_definition("[1]: https://example.com")).toBeNull();
  });
});

describe("number_footnotes", () => {
  it("numbers defined labels in order of first reference", () => {
    const numbers = number_footnotes(["b", "a", "b"], new Set(["a", "b"]));
    expect([...numbers]).toEqual([
      ["b", 1],
      ["a", 2],
    ]);
  });

  it("skips labels without a definition", () => {
    const numbers = number_footnotes(["x", "a"], new Set(["a"]));
    expect([...numbers]).toEqual([["a", 1]]);
  });

  it("matches labels case-insensitively", () => {
    const numbers = number_footnotes(["Note"], new Set(["note"]));
    expect(numbers.get(normalize_footnote_label("NOTE"))).toBe(1);
  });
});

describe("format_footnote_ref", () => {
  it("wraps the label in reference syntax", () => {
    expect(format_footnote_ref("a")).toBe("[^a]");
  });
});
