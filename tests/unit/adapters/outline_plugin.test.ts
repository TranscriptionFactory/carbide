import { describe, it, expect } from "vitest";
import { Schema } from "prosemirror-model";
import type { Node as ProseNode } from "prosemirror-model";
import {
  active_heading_at,
  extract_headings,
} from "$lib/features/editor/adapters/outline_plugin";
import type { OutlineHeading } from "$lib/features/outline";

function create_schema_with_headings() {
  return new Schema({
    nodes: {
      doc: { content: "block+" },
      text: { group: "inline" },
      paragraph: {
        group: "block",
        content: "inline*",
        toDOM: () => ["p", 0] as const,
        parseDOM: [{ tag: "p" }],
      },
      heading: {
        group: "block",
        content: "inline*",
        attrs: { level: { default: 1 } },
        toDOM: (node: ProseNode) =>
          [`h${String(node.attrs.level)}`, 0] as unknown as readonly [
            string,
            0,
          ],
        parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
          tag: `h${String(level)}`,
          attrs: { level },
        })),
      },
    },
    marks: {},
  });
}

function make_heading(schema: Schema, level: number, text: string): ProseNode {
  return schema.node("heading", { level }, text ? [schema.text(text)] : []);
}

function make_paragraph(schema: Schema, text: string): ProseNode {
  return schema.node("paragraph", null, text ? [schema.text(text)] : []);
}

describe("extract_headings", () => {
  it("returns empty array for doc with no headings", () => {
    const schema = create_schema_with_headings();
    const doc = schema.node("doc", null, [
      make_paragraph(schema, "Hello world"),
    ]);
    expect(extract_headings(doc)).toEqual([]);
  });

  it("extracts single heading", () => {
    const schema = create_schema_with_headings();
    const doc = schema.node("doc", null, [make_heading(schema, 1, "Title")]);
    const headings = extract_headings(doc);
    expect(headings).toHaveLength(1);
    const [heading] = headings;
    expect(heading?.level).toBe(1);
    expect(heading?.text).toBe("Title");
    expect(heading?.id).toMatch(/^h-1-title-\d+$/);
  });

  it("extracts multiple headings with correct levels", () => {
    const schema = create_schema_with_headings();
    const doc = schema.node("doc", null, [
      make_heading(schema, 1, "Title"),
      make_paragraph(schema, "Some text"),
      make_heading(schema, 2, "Section A"),
      make_heading(schema, 3, "Subsection"),
      make_heading(schema, 2, "Section B"),
    ]);
    const headings = extract_headings(doc);
    expect(headings).toHaveLength(4);
    expect(headings.map((h) => h.level)).toEqual([1, 2, 3, 2]);
    expect(headings.map((h) => h.text)).toEqual([
      "Title",
      "Section A",
      "Subsection",
      "Section B",
    ]);
  });

  it("handles empty headings", () => {
    const schema = create_schema_with_headings();
    const doc = schema.node("doc", null, [make_heading(schema, 1, "")]);
    const headings = extract_headings(doc);
    expect(headings).toHaveLength(1);
    const [heading] = headings;
    expect(heading?.text).toBe("");
  });

  it("assigns unique IDs based on position", () => {
    const schema = create_schema_with_headings();
    const doc = schema.node("doc", null, [
      make_heading(schema, 1, "A"),
      make_heading(schema, 1, "B"),
    ]);
    const headings = extract_headings(doc);
    expect(headings).toHaveLength(2);
    const [first, second] = headings;
    expect(first?.id).not.toBe(second?.id);
  });

  it("preserves heading positions", () => {
    const schema = create_schema_with_headings();
    const doc = schema.node("doc", null, [
      make_heading(schema, 1, "First"),
      make_paragraph(schema, "Some text between"),
      make_heading(schema, 2, "Second"),
    ]);
    const headings = extract_headings(doc);
    expect(headings).toHaveLength(2);
    const [first, second] = headings;
    expect(first?.pos ?? 0).toBeLessThan(second?.pos ?? 0);
  });
});

describe("active_heading_at", () => {
  const headings: OutlineHeading[] = [
    { id: "h-1-a-0", level: 1, text: "A", pos: 10 },
    { id: "h-2-b-0", level: 2, text: "B", pos: 50 },
    { id: "h-2-c-0", level: 2, text: "C", pos: 100 },
  ];

  it("returns null for empty headings", () => {
    expect(active_heading_at([], 5)).toBeNull();
  });

  it("returns null before the first heading", () => {
    expect(active_heading_at(headings, 5)).toBeNull();
  });

  it("returns the heading at its exact position", () => {
    expect(active_heading_at(headings, 10)).toBe("h-1-a-0");
  });

  it("returns the section containing the position", () => {
    expect(active_heading_at(headings, 60)).toBe("h-2-b-0");
  });

  it("returns the last heading past the end", () => {
    expect(active_heading_at(headings, 9999)).toBe("h-2-c-0");
  });
});
