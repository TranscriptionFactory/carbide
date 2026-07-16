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
      color: null,
      foldable: false,
      default_folded: false,
    });
  });

  it("parses callout with custom title", () => {
    const result = parse_callout_directive("[!warning] Be careful!");
    expect(result).toEqual({
      callout_type: "warning",
      title: "Be careful!",
      color: null,
      foldable: false,
      default_folded: false,
    });
  });

  it("parses foldable open callout", () => {
    const result = parse_callout_directive("[!tip]+");
    expect(result).toEqual({
      callout_type: "tip",
      title: "Tip",
      color: null,
      foldable: true,
      default_folded: false,
    });
  });

  it("parses foldable closed callout", () => {
    const result = parse_callout_directive("[!danger]- Watch out");
    expect(result).toEqual({
      callout_type: "danger",
      title: "Watch out",
      color: null,
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
        color: null,
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
        color: null,
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
        color: null,
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

  it("foldable callout has folded attr matching default_folded on parse", () => {
    const folded_input = "> [!danger]- Watch out\n> Danger zone.";
    const doc_folded = parse_markdown(folded_input);
    const callout_folded = doc_folded.firstChild;
    expect(callout_folded?.attrs["foldable"]).toBe(true);
    expect(callout_folded?.attrs["default_folded"]).toBe(true);
    expect(callout_folded?.attrs["folded"]).toBe(true);

    const open_input = "> [!tip]+\n> A helpful tip.";
    const doc_open = parse_markdown(open_input);
    const callout_open = doc_open.firstChild;
    expect(callout_open?.attrs["foldable"]).toBe(true);
    expect(callout_open?.attrs["default_folded"]).toBe(false);
    expect(callout_open?.attrs["folded"]).toBe(false);
  });

  it("non-foldable callout has folded: false regardless", () => {
    const input = "> [!note]\n> Simple note.";
    const doc = parse_markdown(input);
    const callout = doc.firstChild;
    expect(callout?.attrs["foldable"]).toBe(false);
    expect(callout?.attrs["folded"]).toBe(false);
  });

  it("fold marker reflects live folded state on serialize", () => {
    const make = (folded: boolean) =>
      schema.nodes.doc.create(null, [
        schema.nodes.callout.create(
          {
            callout_type: "tip",
            foldable: true,
            default_folded: true,
            folded,
          },
          [
            schema.nodes.callout_title.create(null, schema.text("Tip")),
            schema.nodes.callout_body.create(null, [
              schema.nodes.paragraph.create(null, schema.text("Content")),
            ]),
          ],
        ),
      ]);

    expect(serialize_markdown(make(true)).trim()).toContain("[!tip]-");
    expect(serialize_markdown(make(false)).trim()).toContain("[!tip]+");
  });

  it("live folded state survives serialize→parse remount", () => {
    const input = "> [!danger]- Watch out\n> Danger zone.";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    expect(output).toContain("[!danger]-");

    const reparsed = parse_markdown(output);
    const callout = reparsed.firstChild;
    expect(callout?.attrs["default_folded"]).toBe(true);
    expect(callout?.attrs["folded"]).toBe(true);
  });

  it("custom title round-trips through markdown", () => {
    const input = "> [!warning] Be careful!\n> Something dangerous.";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    expect(output).toContain("[!warning] Be careful!");
  });

  it("edited title serializes into the directive", () => {
    const callout = schema.nodes.callout.create(
      { callout_type: "note", foldable: false, default_folded: false },
      [
        schema.nodes.callout_title.create(null, schema.text("My custom title")),
        schema.nodes.callout_body.create(null, [
          schema.nodes.paragraph.create(null, schema.text("Body")),
        ]),
      ],
    );
    const doc = schema.nodes.doc.create(null, [callout]);
    const output = serialize_markdown(doc).trim();
    expect(output).toContain("[!note] My custom title");
  });

  it("default title stays omitted from the directive", () => {
    const callout = schema.nodes.callout.create(
      { callout_type: "note", foldable: false, default_folded: false },
      [
        schema.nodes.callout_title.create(null, schema.text("Note")),
        schema.nodes.callout_body.create(null, [
          schema.nodes.paragraph.create(null, schema.text("Body")),
        ]),
      ],
    );
    const doc = schema.nodes.doc.create(null, [callout]);
    const output = serialize_markdown(doc).trim();
    expect(output).toContain("> [!note]\n");
    expect(output).not.toContain("[!note] Note");
  });

  it("plain [!note] callout stays markerless through roundtrip", () => {
    const input = "> [!note]\n> Simple note.";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    expect(output).toContain("[!note]");
    expect(output).not.toContain("[!note]+");
    expect(output).not.toContain("[!note]-");
  });
});

describe("callout with leading divider (setext fusion)", () => {
  it("parses a directive fused with a --- divider as callout with hr body", () => {
    const input = "> [!note|red]\n> ---\n> Body text";
    const doc = parse_markdown(input);
    const callout = doc.firstChild;
    expect(callout?.type.name).toBe("callout");
    expect(callout?.attrs["callout_type"]).toBe("note");
    expect(callout?.attrs["callout_color"]).toBe("red");

    const body = callout?.child(1);
    expect(body?.child(0).type.name).toBe("hr");
    expect(body?.child(1).type.name).toBe("paragraph");
    expect(body?.child(1).textContent).toBe("Body text");
  });

  it("serializes a leading-divider body with a bare > gap and reaches a fixed point", () => {
    const input = "> [!note|red]\n> ---\n> Body text";
    const once = serialize_markdown(parse_markdown(input));
    expect(once.trimEnd()).toBe("> [!note|red]\n>\n> ---\n>\n> Body text");
    expect(serialize_markdown(parse_markdown(once))).toBe(once);
  });

  it("heals the corrupted ATX form > ## [!note|red]", () => {
    const input = "> ## [!note|red]\n> Body text";
    const doc = parse_markdown(input);
    const callout = doc.firstChild;
    expect(callout?.type.name).toBe("callout");
    expect(callout?.attrs["callout_color"]).toBe("red");

    const body = callout?.child(1);
    expect(body?.child(0).type.name).toBe("paragraph");
    expect(body?.child(0).textContent).toBe("Body text");
  });

  it("leaves blockquote headings without a directive untouched", () => {
    const input = "> ## Just a heading\n> Body";
    const doc = parse_markdown(input);
    expect(doc.firstChild?.type.name).toBe("blockquote");
  });
});
