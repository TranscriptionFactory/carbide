import { describe, it, expect } from "vitest";
import { Schema, type NodeType } from "prosemirror-model";
import { EditorState, type Transaction } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import {
  active_heading_at,
  create_outline_prose_plugin,
  extract_headings,
  outline_plugin_key,
} from "$lib/features/editor/adapters/outline_plugin";
import type { OutlineHeading } from "$lib/features/outline";
import { seeded_rng } from "../helpers/seeded_rng";
import {
  meter_document_work,
  type WorkCounters,
} from "../helpers/document_work_meter";

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
      blockquote: {
        group: "block",
        content: "block+",
        toDOM: () => ["blockquote", 0] as const,
        parseDOM: [{ tag: "blockquote" }],
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

  it("adds a paragraph turned into a heading", () => {
    const schema = create_schema_with_headings();
    const state = make_plugin_state(schema, [make_paragraph(schema, "Para")]);

    const next = state.apply(
      state.tr.setBlockType(1, 5, schema.nodes.heading as NodeType, {
        level: 2,
      }),
    );

    expect(headings_of(next).map((h) => h.text)).toEqual(["Para"]);
  });

  it("updates the outline when editing inside a heading", () => {
    const schema = create_schema_with_headings();
    const state = make_plugin_state(schema, [make_heading(schema, 1, "Title")]);

    const next = state.apply(state.tr.insertText("!", 3));

    expect(headings_of(next)[0]?.text).toBe("Ti!tle");
  });
});

function linear_active_heading(
  headings: OutlineHeading[],
  pos: number,
): string | null {
  let active: string | null = null;
  for (const h of headings) {
    if (h.pos > pos) break;
    active = h.id;
  }
  return active;
}

describe("active_heading_at equivalence", () => {
  it("matches a linear scan for every position", () => {
    const rng = seeded_rng(7);
    for (let round = 0; round < 50; round++) {
      let pos = 0;
      const headings: OutlineHeading[] = Array.from(
        { length: Math.floor(rng() * 12) },
        (_, i) => {
          pos += 1 + Math.floor(rng() * 20);
          return { id: `h-${String(i)}`, level: 1, text: "", pos };
        },
      );
      for (let probe = -1; probe <= pos + 2; probe++) {
        expect(active_heading_at(headings, probe)).toBe(
          linear_active_heading(headings, probe),
        );
      }
    }
  });
});

function structure_revision_of(state: EditorState): number | undefined {
  return outline_plugin_key.getState(state)?.structure_revision;
}

describe("outline structure revision", () => {
  it("holds across a position-only shift and bumps on a retitle", () => {
    const schema = create_schema_with_headings();
    const state = make_plugin_state(schema, [
      make_paragraph(schema, "body"),
      make_heading(schema, 1, "Title"),
    ]);
    const shifted = state.apply(state.tr.insertText("x", 2));
    expect(structure_revision_of(shifted)).toBe(structure_revision_of(state));
    expect(headings_of(shifted)[0]?.pos).toBe(
      (headings_of(state)[0]?.pos ?? 0) + 1,
    );

    const retitled = shifted.apply(shifted.tr.insertText("!", 9));
    expect(structure_revision_of(retitled)).toBe(
      (structure_revision_of(shifted) ?? 0) + 1,
    );
  });
});

describe("duplicate heading slugs", () => {
  it("renumbers later duplicates when an earlier one is retitled", () => {
    const schema = create_schema_with_headings();
    const state = make_plugin_state(schema, [
      make_heading(schema, 1, "A"),
      make_heading(schema, 1, "A"),
      make_heading(schema, 1, "A"),
    ]);
    expect(headings_of(state).map((h) => h.id)).toEqual([
      "h-1-a-0",
      "h-1-a-1",
      "h-1-a-2",
    ]);

    const next = state.apply(state.tr.insertText("b", 2));

    expect(headings_of(next).map((h) => h.id)).toEqual([
      "h-1-ab-0",
      "h-1-a-0",
      "h-1-a-1",
    ]);
    expect(headings_of(next)).toEqual(extract_headings(next.doc));
  });

  it("renumbers when a duplicate heading is inserted before the others", () => {
    const schema = create_schema_with_headings();
    const state = make_plugin_state(schema, [
      make_paragraph(schema, "p"),
      make_heading(schema, 2, "Same"),
    ]);
    const next = state.apply(
      state.tr.insert(0, make_heading(schema, 2, "Same")),
    );
    expect(headings_of(next).map((h) => h.id)).toEqual([
      "h-2-same-0",
      "h-2-same-1",
    ]);
    expect(headings_of(next)).toEqual(extract_headings(next.doc));
  });
});

const TITLES = ["A", "B", "A b", "", "Intro"];

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T;
}

function random_block(schema: Schema, rng: () => number): ProseNode {
  const roll = rng();
  if (roll < 0.4) {
    return make_heading(schema, 1 + Math.floor(rng() * 3), pick(rng, TITLES));
  }
  if (roll < 0.55) {
    return schema.node("blockquote", null, [
      make_heading(schema, 2, pick(rng, TITLES)),
      make_paragraph(schema, "q"),
    ]);
  }
  return make_paragraph(schema, pick(rng, ["one", "two", ""]));
}

function block_boundaries(doc: ProseNode): number[] {
  const bounds = [0];
  doc.forEach((node, offset) => bounds.push(offset + node.nodeSize));
  return bounds;
}

function textblock_positions(doc: ProseNode): number[] {
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) positions.push(pos + 1 + node.content.size);
    return true;
  });
  return positions;
}

function random_step(schema: Schema, tr: Transaction, rng: () => number) {
  const doc = tr.doc;
  const roll = rng();
  if (roll < 0.3) {
    tr.insertText(
      pick(rng, ["x", "A", " b"]),
      pick(rng, textblock_positions(doc)),
    );
  } else if (roll < 0.5) {
    tr.insert(pick(rng, block_boundaries(doc)), random_block(schema, rng));
  } else if (roll < 0.7) {
    const a = Math.floor(rng() * doc.content.size);
    const b = Math.min(doc.content.size, a + Math.floor(rng() * 12));
    tr.delete(a, b);
  } else if (roll < 0.85) {
    const pos = pick(rng, textblock_positions(doc));
    const $pos = doc.resolve(pos);
    tr.setBlockType(
      $pos.start(),
      $pos.end(),
      schema.nodes.heading as NodeType,
      { level: 1 + Math.floor(rng() * 3) },
    );
  } else {
    const pos = pick(rng, textblock_positions(doc));
    const $pos = doc.resolve(pos);
    tr.setBlockType(
      $pos.start(),
      $pos.end(),
      schema.nodes.paragraph as NodeType,
    );
  }
}

describe("incremental outline equivalence", () => {
  it.each([1, 2, 3, 4, 5])(
    "equals a full extraction after every random edit (seed %i)",
    (seed) => {
      const schema = create_schema_with_headings();
      const rng = seeded_rng(seed);
      let state = make_plugin_state(
        schema,
        Array.from({ length: 12 }, () => random_block(schema, rng)),
      );
      for (let i = 0; i < 150; i++) {
        const tr = state.tr;
        const steps = 1 + Math.floor(rng() * 2);
        for (let s = 0; s < steps; s++) {
          try {
            random_step(schema, tr, rng);
          } catch {
            // An invalid random replace is skipped, not a finding.
          }
        }
        state = state.apply(tr);
        expect(
          headings_of(state),
          `seed ${String(seed)} edit ${String(i)}`,
        ).toEqual(extract_headings(state.doc));
      }
    },
  );
});

describe("outline typing cost", () => {
  function typing_work(sections: number): WorkCounters {
    const schema = create_schema_with_headings();
    const blocks: ProseNode[] = [];
    for (let i = 0; i < sections; i++) {
      blocks.push(make_heading(schema, 2, `Section ${String(i)}`));
      blocks.push(make_paragraph(schema, "body text"));
    }
    const state = make_plugin_state(schema, blocks);
    const pos = state.doc.child(0).nodeSize + 3;
    const tr = state.tr.insertText("x", pos);
    const meter = meter_document_work(tr.doc);
    state.apply(tr);
    return meter.stop();
  }

  it("reads the same bounded work regardless of heading count", () => {
    const small = typing_work(10);
    const large = typing_work(800);
    expect(large).toEqual(small);
    expect(large.chars).toBeLessThan(100);
  });
});
