import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  parse_callout_directive,
  format_callout_directive,
  normalize_callout_type,
  canonical_callout_type,
} from "$lib/features/editor/adapters/remark_plugins/remark_callout";

describe("callout directive parsing", () => {
  it("parses basic note callout", () => {
    const result = parse_callout_directive("[!note]");
    expect(result).toEqual({
      callout_type: "note",
      title: "Note",
      foldable: false,
      default_folded: false,
    });
  });

  it("parses callout with custom title", () => {
    const result = parse_callout_directive("[!warning] Be careful!");
    expect(result).toEqual({
      callout_type: "warning",
      title: "Be careful!",
      foldable: false,
      default_folded: false,
    });
  });

  it("parses foldable open callout", () => {
    const result = parse_callout_directive("[!tip]+");
    expect(result).toEqual({
      callout_type: "tip",
      title: "Tip",
      foldable: true,
      default_folded: false,
    });
  });

  it("parses foldable closed callout", () => {
    const result = parse_callout_directive("[!danger]- Watch out");
    expect(result).toEqual({
      callout_type: "danger",
      title: "Watch out",
      foldable: true,
      default_folded: true,
    });
  });

  it("normalizes unknown type to note", () => {
    expect(normalize_callout_type("unknown")).toBe("note");
  });

  it("normalizes known aliases", () => {
    expect(normalize_callout_type("caution")).toBe("caution");
    expect(canonical_callout_type("caution")).toBe("warning");
    expect(canonical_callout_type("tldr")).toBe("abstract");
    expect(canonical_callout_type("hint")).toBe("tip");
  });

  it("returns null for non-callout text", () => {
    expect(parse_callout_directive("just text")).toBeNull();
    expect(parse_callout_directive("")).toBeNull();
  });
});

describe("callout directive formatting", () => {
  it("formats basic callout", () => {
    expect(
      format_callout_directive({
        callout_type: "note",
        title: "Note",
        foldable: false,
        default_folded: false,
      }),
    ).toBe("[!note]");
  });

  it("formats callout with custom title", () => {
    expect(
      format_callout_directive({
        callout_type: "warning",
        title: "Be careful!",
        foldable: false,
        default_folded: false,
      }),
    ).toBe("[!warning] Be careful!");
  });

  it("formats foldable closed callout", () => {
    expect(
      format_callout_directive({
        callout_type: "tip",
        title: "Tip",
        foldable: true,
        default_folded: true,
      }),
    ).toBe("[!tip]-");
  });
});

describe("callout markdown roundtrip", () => {
  it("parses basic callout from markdown", () => {
    const input = "> [!note]\n> This is a note.";
    const doc = parse_markdown(input);
    const callout = doc.firstChild;
    expect(callout?.type.name).toBe("callout");
    expect(callout?.attrs["callout_type"]).toBe("note");
  });

  it("parses callout with custom title", () => {
    const input = "> [!warning] Be careful!\n> Something dangerous.";
    const doc = parse_markdown(input);
    const callout = doc.firstChild;
    expect(callout?.type.name).toBe("callout");
    expect(callout?.attrs["callout_type"]).toBe("warning");
  });

  it("round-trips a simple note callout", () => {
    const input = "> [!note]\n> This is a note.";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    expect(output).toContain("[!note]");
    expect(output).toContain("This is a note.");
  });

  it("preserves foldable state through roundtrip", () => {
    const input = "> [!tip]+\n> A helpful tip.";
    const doc = parse_markdown(input);
    const callout = doc.firstChild;
    expect(callout?.attrs["foldable"]).toBe(true);
    expect(callout?.attrs["default_folded"]).toBe(false);
  });

  it("leaves regular blockquotes untouched", () => {
    const input = "> Just a regular quote.";
    const doc = parse_markdown(input);
    expect(doc.firstChild?.type.name).toBe("blockquote");
  });

  it("builds callout PM node directly from schema", () => {
    const callout = schema.nodes.callout.create(
      { callout_type: "warning", foldable: false, default_folded: false },
      [
        schema.nodes.callout_title.create(null, schema.text("Warning")),
        schema.nodes.callout_body.create(null, [
          schema.nodes.paragraph.create(null, schema.text("Watch out!")),
        ]),
      ],
    );
    const doc = schema.nodes.doc.create(null, [callout]);
    const output = serialize_markdown(doc).trim();
    expect(output).toContain("[!warning]");
    expect(output).toContain("Watch out!");
  });

  it("handles callout with multiple body paragraphs", () => {
    const input = "> [!note]\n> First paragraph.\n>\n> Second paragraph.";
    const doc = parse_markdown(input);
    const callout = doc.firstChild;
    expect(callout?.type.name).toBe("callout");
    const body = callout?.child(1);
    expect(body?.childCount).toBe(2);
  });

  it("handles callout with empty body", () => {
    const input = "> [!note]";
    const doc = parse_markdown(input);
    const callout = doc.firstChild;
    expect(callout?.type.name).toBe("callout");
    expect(callout?.child(1)?.childCount).toBeGreaterThan(0);
  });
});
