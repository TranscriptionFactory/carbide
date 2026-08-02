/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { schema } from "$lib/features/editor/adapters/schema";
import type { FindMatchRange } from "$lib/features/editor/domain/find_types";
import { resolve_ambient_anchor } from "$lib/features/editor/domain/ambient_anchor";

function make_doc(text: string) {
  return schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, schema.text(text)),
  ]);
}

function resolved(range: FindMatchRange | null): FindMatchRange {
  if (!range) throw new Error("expected the anchor to resolve");
  return range;
}

describe("resolve_ambient_anchor", () => {
  it("resolves a note-level anchor to no range", () => {
    expect(resolve_ambient_anchor(make_doc("anything"), { kind: "note" })).toBe(
      null,
    );
  });

  it("resolves a single occurrence to the range covering it", () => {
    const doc = make_doc("links to fusion-weights today");

    const range = resolved(
      resolve_ambient_anchor(doc, {
        kind: "text",
        match: "fusion-weights",
        occurrence: 0,
      }),
    );

    expect(doc.textBetween(range.from, range.to)).toBe("fusion-weights");
  });

  it("selects the nth occurrence, zero-based", () => {
    const doc = make_doc("x1 then x2 then x3");

    const range = resolved(
      resolve_ambient_anchor(doc, {
        kind: "text",
        match: "x",
        occurrence: 2,
      }),
    );

    expect(doc.textBetween(range.from, range.to + 1)).toBe("x3");
  });

  it("degrades to null when the occurrence index exceeds the matches found", () => {
    const doc = make_doc("x and x");

    expect(
      resolve_ambient_anchor(doc, { kind: "text", match: "x", occurrence: 2 }),
    ).toBeNull();
  });

  it("degrades to null when the anchor text is absent entirely", () => {
    expect(
      resolve_ambient_anchor(make_doc("nothing here"), {
        kind: "text",
        match: "fusion-weights",
        occurrence: 0,
      }),
    ).toBeNull();
  });

  it("degrades to null for an empty match instead of matching everywhere", () => {
    expect(
      resolve_ambient_anchor(make_doc("some prose"), {
        kind: "text",
        match: "",
        occurrence: 0,
      }),
    ).toBeNull();
  });

  it("does not resolve across a mark boundary rather than reporting a partial range", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text("fusion-"),
        schema.text("weights", [schema.marks.strong.create()]),
      ]),
    ]);

    expect(
      resolve_ambient_anchor(doc, {
        kind: "text",
        match: "fusion-weights",
        occurrence: 0,
      }),
    ).toBeNull();
  });

  it("is case sensitive, so a differently cased phrase is not underlined", () => {
    expect(
      resolve_ambient_anchor(make_doc("Fusion-Weights"), {
        kind: "text",
        match: "fusion-weights",
        occurrence: 0,
      }),
    ).toBeNull();
  });

  it("never throws for any degenerate anchor", () => {
    const doc = make_doc("prose");

    expect(() =>
      resolve_ambient_anchor(doc, {
        kind: "text",
        match: "absent",
        occurrence: 99,
      }),
    ).not.toThrow();
  });
});
