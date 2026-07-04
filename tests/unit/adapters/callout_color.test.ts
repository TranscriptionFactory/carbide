import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  parse_callout_directive,
  format_callout_directive,
  sanitize_callout_color,
} from "$lib/features/editor/adapters/remark_plugins/remark_callout";

describe("callout color directive parsing", () => {
  it("parses directive without color to null", () => {
    const result = parse_callout_directive("[!note]");
    expect(result?.color).toBeNull();
  });

  it("parses named color", () => {
    const result = parse_callout_directive("[!note|purple]");
    expect(result).toEqual({
      callout_type: "note",
      title: "Note",
      color: "purple",
      foldable: false,
      default_folded: false,
    });
  });

  it("parses hex color", () => {
    const result = parse_callout_directive("[!warning|#ff8800] Careful");
    expect(result?.color).toBe("#ff8800");
    expect(result?.callout_type).toBe("warning");
    expect(result?.title).toBe("Careful");
  });

  it("parses color composed with foldable markers", () => {
    const open = parse_callout_directive("[!tip|teal]+");
    expect(open).toEqual({
      callout_type: "tip",
      title: "Tip",
      color: "teal",
      foldable: true,
      default_folded: false,
    });

    const closed = parse_callout_directive("[!danger|blue]- Watch out");
    expect(closed).toEqual({
      callout_type: "danger",
      title: "Watch out",
      color: "blue",
      foldable: true,
      default_folded: true,
    });
  });

  it("normalizes color casing", () => {
    expect(parse_callout_directive("[!note|RED]")?.color).toBe("red");
  });

  it("ignores unknown color names", () => {
    const result = parse_callout_directive("[!note|notacolor]");
    expect(result?.callout_type).toBe("note");
    expect(result?.color).toBeNull();
  });

  it("ignores empty and malformed color suffixes", () => {
    expect(parse_callout_directive("[!note|]")?.color).toBeNull();
    expect(parse_callout_directive("[!note|purple|extra]")?.color).toBeNull();
    expect(parse_callout_directive("[!note|#zzz]")?.color).toBeNull();
  });

  it("keeps unknown type fallback with valid color", () => {
    const result = parse_callout_directive("[!mystery|red]");
    expect(result?.callout_type).toBe("note");
    expect(result?.color).toBe("red");
  });
});

describe("callout color sanitization", () => {
  it("accepts named colors and hex", () => {
    expect(sanitize_callout_color("teal")).toBe("teal");
    expect(sanitize_callout_color("grey")).toBe("grey");
    expect(sanitize_callout_color("#a1b2c3")).toBe("#a1b2c3");
    expect(sanitize_callout_color("#abc")).toBe("#abc");
  });

  it("rejects invalid values", () => {
    expect(sanitize_callout_color("")).toBeNull();
    expect(sanitize_callout_color("  ")).toBeNull();
    expect(sanitize_callout_color("chartreuse-ish")).toBeNull();
    expect(sanitize_callout_color("#12")).toBeNull();
    expect(sanitize_callout_color(null)).toBeNull();
    expect(sanitize_callout_color(undefined)).toBeNull();
  });
});

describe("callout color directive formatting", () => {
  it("emits no pipe when color is null", () => {
    const directive = format_callout_directive({
      callout_type: "note",
      title: "Note",
      color: null,
      foldable: false,
      default_folded: false,
    });
    expect(directive).toBe("[!note]");
    expect(directive).not.toContain("|");
  });

  it("emits color suffix", () => {
    expect(
      format_callout_directive({
        callout_type: "note",
        title: "Note",
        color: "purple",
        foldable: false,
        default_folded: false,
      }),
    ).toBe("[!note|purple]");
  });

  it("composes color with fold marker and title", () => {
    expect(
      format_callout_directive({
        callout_type: "tip",
        title: "A tip",
        color: "teal",
        foldable: true,
        default_folded: true,
      }),
    ).toBe("[!tip|teal]- A tip");
  });
});

describe("callout color markdown roundtrip", () => {
  it("parses colored callout into callout_color attr", () => {
    const doc = parse_markdown("> [!note|purple]\n> Body text.");
    const callout = doc.firstChild;
    expect(callout?.type.name).toBe("callout");
    expect(callout?.attrs["callout_color"]).toBe("purple");
  });

  it("defaults callout_color to null when directive has no color", () => {
    const doc = parse_markdown("> [!note]\n> Body text.");
    expect(doc.firstChild?.attrs["callout_color"]).toBeNull();
  });

  it("round-trips color through serialize", () => {
    const doc = parse_markdown("> [!tip|teal]+\n> A helpful tip.");
    const output = serialize_markdown(doc);
    expect(output).toContain("[!tip|teal]+");
  });

  it("is byte-stable for callouts without explicit color", () => {
    const input = "> [!note]\n> This is a note.\n";
    const once = serialize_markdown(parse_markdown(input));
    expect(once).not.toContain("[!note|");
    const twice = serialize_markdown(parse_markdown(once));
    expect(twice).toBe(once);
  });

  it("is stable across repeated round-trips with color", () => {
    const input = "> [!danger|#ff0000]- Watch out\n> Danger zone.\n";
    const once = serialize_markdown(parse_markdown(input));
    expect(once).toContain("[!danger|#ff0000]-");
    const twice = serialize_markdown(parse_markdown(once));
    expect(twice).toBe(once);
  });

  it("serializes callout_color attr from a PM node built directly", () => {
    const callout = schema.nodes.callout.create(
      { callout_type: "note", callout_color: "purple" },
      [
        schema.nodes.callout_title.create(null, schema.text("Note")),
        schema.nodes.callout_body.create(null, [
          schema.nodes.paragraph.create(null, schema.text("Body.")),
        ]),
      ],
    );
    const doc = schema.nodes.doc.create(null, [callout]);
    expect(serialize_markdown(doc)).toContain("[!note|purple]");
  });

  it("drops invalid color on parse and serializes without pipe", () => {
    const doc = parse_markdown("> [!note|bogus]\n> Body.");
    expect(doc.firstChild?.attrs["callout_color"]).toBeNull();
    expect(serialize_markdown(doc)).not.toContain("|");
  });
});
