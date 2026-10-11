import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";

function roundtrip(markdown: string): string {
  return serialize_markdown(parse_markdown(markdown));
}

function expect_byte_identical(input: string) {
  const once = roundtrip(input);
  expect(once).toBe(`${input}\n`);
  expect(roundtrip(once)).toBe(once);
}

describe("footnote parsing", () => {
  it("parses a reference into a footnote_ref atom carrying its label and source", () => {
    const para = parse_markdown("Claim[^Note].\n\n[^Note]: Body.").child(0);
    const ref = para.child(1);
    expect(ref.type.name).toBe("footnote_ref");
    expect(ref.attrs).toEqual({ label: "Note", raw: "[^Note]" });
  });

  it("parses a definition into a footnote_def block holding its exact source", () => {
    const input = "A[^1]\n\n[^1]: line one\n  line two";
    const def = parse_markdown(input).child(1);
    expect(def.type.name).toBe("footnote_def");
    expect(def.textContent).toBe("[^1]: line one\n  line two");
  });

  it("keeps a reference without a definition as literal text", () => {
    const para = parse_markdown("Dangling[^x] ref.").child(0);
    const types: string[] = [];
    para.forEach((child) => types.push(child.type.name));
    expect(types).not.toContain("footnote_ref");
    expect(para.textContent).toBe("Dangling[^x] ref.");
  });
});

describe("footnote round-trip", () => {
  it("is byte-identical for a numeric reference and single-line definition", () => {
    expect_byte_identical("A claim.[^1]\n\n[^1]: The footnote body.");
  });

  it("is byte-identical for named labels", () => {
    expect_byte_identical(
      "First[^alpha] and second[^Beta-2].\n\n[^alpha]: One.\n\n[^Beta-2]: Two.",
    );
  });

  it("keeps the 2-space continuation indent of multi-line definitions", () => {
    expect_byte_identical(
      "See[^1].\n\n[^1]: line one\n  line two\n  line three",
    );
  });

  it("keeps consecutive definitions without a blank line between them", () => {
    expect_byte_identical("A[^a] B[^b]\n\n[^a]: one\n  more\n[^b]: two");
  });

  it("keeps the blank line between definitions separated in the source", () => {
    expect_byte_identical("A[^a] B[^b]\n\n[^a]: one\n\n[^b]: two");
  });

  it("is byte-identical for a reference inside emphasis", () => {
    expect_byte_identical("*claim[^1] here*\n\n[^1]: Body.");
  });

  it("preserves definition formatting characters verbatim", () => {
    expect_byte_identical("X[^1]\n\n[^1]: *not* escaped_ [link](a b) <b>");
  });
});
