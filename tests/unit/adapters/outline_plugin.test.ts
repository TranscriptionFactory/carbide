import { describe, it, expect } from "vitest";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import {
  active_heading_at,
  create_outline_prose_plugin,
  extract_headings,
  map_headings_forward,
  outline_plugin_key,
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

function make_plugin_state(schema: Schema, blocks: ProseNode[]): EditorState {
  const doc = schema.node("doc", null, blocks);
  return EditorState.create({ doc, plugins: [create_outline_prose_plugin()] });
}

function headings_of(state: EditorState): OutlineHeading[] {
  return outline_plugin_key.getState(state)?.headings ?? [];
}

describe("outline plugin short-circuit", () => {
  it("keeps headings identical when editing below all headings", () => {
    const schema = create_schema_with_headings();
    const state = make_plugin_state(schema, [
      make_heading(schema, 1, "Title"),
      make_paragraph(schema, "body text"),
    ]);
    const before = headings_of(state);

    const next = state.apply(state.tr.insertText("x", 12));

    expect(headings_of(next)).toEqual(before);
  });

  it("shifts heading positions when editing above a heading", () => {
    const schema = create_schema_with_headings();
    const state = make_plugin_state(schema, [
      make_heading(schema, 1, "Title"),
      make_paragraph(schema, "body"),
      make_heading(schema, 2, "Section"),
    ]);
    const before = headings_of(state);

    const next = state.apply(state.tr.insertText("x", 8));

    const after = headings_of(next);
    expect(after).toHaveLength(before.length);
    expect(after[0]).toEqual(before[0]);
    expect(after[1]?.pos).toBe((before[1]?.pos ?? 0) + 1);
  });

  it("updates the outline when editing inside a heading", () => {
    const schema = create_schema_with_headings();
    const state = make_plugin_state(schema, [make_heading(schema, 1, "Title")]);

    const next = state.apply(state.tr.insertText("!", 3));

    expect(headings_of(next)[0]?.text).toBe("Ti!tle");
  });
});

describe("map_headings_forward", () => {
  it("returns mapped headings without a recompute for a non-heading edit", () => {
    const schema = create_schema_with_headings();
    const doc = schema.node("doc", null, [
      make_heading(schema, 1, "Title"),
      make_paragraph(schema, "body"),
    ]);
    const state = EditorState.create({ doc });
    const headings = extract_headings(doc);

    const tr = state.tr.insertText("x", 8);
    const next = state.apply(tr);

    const mapped = map_headings_forward(tr, headings, next.doc);
    expect(mapped).not.toBeNull();
    expect(mapped).toHaveLength(headings.length);
    expect(mapped?.[0]?.pos).toBe(headings[0]?.pos);
  });

  it("returns null when a heading is edited", () => {
    const schema = create_schema_with_headings();
    const doc = schema.node("doc", null, [make_heading(schema, 1, "Title")]);
    const state = EditorState.create({ doc });
    const headings = extract_headings(doc);

    const tr = state.tr.insertText("!", 3);
    const next = state.apply(tr);

    expect(map_headings_forward(tr, headings, next.doc)).toBeNull();
  });
});
