/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { schema } from "$lib/features/editor/adapters/markdown_pipeline";
import { compute_heading_ranges } from "$lib/features/editor/adapters/heading_fold_plugin";
import { EditorState } from "prosemirror-state";
import {
  create_heading_fold_prose_plugin,
  heading_fold_plugin_key,
} from "$lib/features/editor/adapters/heading_fold_plugin";

function make_heading(level: number, text: string) {
  return schema.nodes.heading.create({ level }, schema.text(text));
}

function make_paragraph(text: string) {
  return schema.nodes.paragraph.create(null, schema.text(text));
}

function make_doc(...children: ReturnType<typeof make_heading>[]) {
  return schema.nodes.doc.create(null, children);
}

describe("compute_heading_ranges", () => {
  it("returns empty for doc with no headings", () => {
    const doc = make_doc(make_paragraph("hello"));
    expect(compute_heading_ranges(doc)).toEqual([]);
  });

  it("computes range for a single heading followed by a paragraph", () => {
    const doc = make_doc(make_heading(1, "Title"), make_paragraph("body"));
    const ranges = compute_heading_ranges(doc);

    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.level).toBe(1);
    expect(ranges[0]!.body_start).toBeLessThan(ranges[0]!.body_end);
  });

  it("stops section at same-level heading", () => {
    const doc = make_doc(
      make_heading(2, "Section A"),
      make_paragraph("content a"),
      make_heading(2, "Section B"),
      make_paragraph("content b"),
    );
    const ranges = compute_heading_ranges(doc);

    expect(ranges).toHaveLength(2);
    expect(ranges[0]!.body_end).toBe(ranges[1]!.heading_pos);
  });

  it("includes nested headings in parent section range", () => {
    const doc = make_doc(
      make_heading(1, "Parent"),
      make_paragraph("intro"),
      make_heading(2, "Child"),
      make_paragraph("child content"),
    );
    const ranges = compute_heading_ranges(doc);

    expect(ranges).toHaveLength(2);
    const parent_range = ranges[0]!;
    const child_range = ranges[1]!;
    expect(parent_range.body_end).toBe(doc.content.size);
    expect(child_range.heading_pos).toBeGreaterThan(parent_range.heading_pos);
    expect(child_range.heading_pos).toBeLessThan(parent_range.body_end);
  });

  it("stops parent section at higher-level heading", () => {
    const doc = make_doc(
      make_heading(2, "Sub"),
      make_paragraph("content"),
      make_heading(1, "Top"),
      make_paragraph("top content"),
    );
    const ranges = compute_heading_ranges(doc);

    expect(ranges).toHaveLength(2);
    expect(ranges[0]!.body_end).toBe(ranges[1]!.heading_pos);
  });

  it("excludes headings with no body content between same-level siblings", () => {
    const doc = make_doc(make_heading(1, "First"), make_heading(1, "Second"));
    const ranges = compute_heading_ranges(doc);

    expect(ranges).toHaveLength(0);
  });
});

describe("heading_fold_plugin state", () => {
  function create_state_with_plugin(
    ...children: ReturnType<typeof make_heading>[]
  ) {
    const doc = make_doc(...children);
    return EditorState.create({
      doc,
      plugins: [create_heading_fold_prose_plugin()],
    });
  }

  it("initializes with no folds and empty decorations", () => {
    const state = create_state_with_plugin(
      make_heading(1, "Title"),
      make_paragraph("body"),
    );
    const plugin_state = heading_fold_plugin_key.getState(state);

    expect(plugin_state).toBeDefined();
    expect(plugin_state!.folded.size).toBe(0);
  });

  it("toggles a heading fold via transaction meta", () => {
    const state = create_state_with_plugin(
      make_heading(1, "Title"),
      make_paragraph("body"),
    );
    const ranges = compute_heading_ranges(state.doc);
    const heading_pos = ranges[0]!.heading_pos;

    const tr = state.tr.setMeta(heading_fold_plugin_key, {
      action: "toggle",
      pos: heading_pos,
    });
    const next = state.apply(tr);
    const plugin_state = heading_fold_plugin_key.getState(next);

    expect(plugin_state!.folded.has(heading_pos)).toBe(true);
  });

  it("toggles off a previously folded heading", () => {
    let state = create_state_with_plugin(
      make_heading(1, "Title"),
      make_paragraph("body"),
    );
    const ranges = compute_heading_ranges(state.doc);
    const heading_pos = ranges[0]!.heading_pos;

    state = state.apply(
      state.tr.setMeta(heading_fold_plugin_key, {
        action: "toggle",
        pos: heading_pos,
      }),
    );
    state = state.apply(
      state.tr.setMeta(heading_fold_plugin_key, {
        action: "toggle",
        pos: heading_pos,
      }),
    );
    const plugin_state = heading_fold_plugin_key.getState(state);

    expect(plugin_state!.folded.has(heading_pos)).toBe(false);
  });

  it("collapse_all folds every heading", () => {
    let state = create_state_with_plugin(
      make_heading(1, "A"),
      make_paragraph("a"),
      make_heading(2, "B"),
      make_paragraph("b"),
    );
    state = state.apply(
      state.tr.setMeta(heading_fold_plugin_key, { action: "collapse_all" }),
    );
    const plugin_state = heading_fold_plugin_key.getState(state);
    const ranges = compute_heading_ranges(state.doc);

    expect(plugin_state!.folded.size).toBe(ranges.length);
    for (const r of ranges) {
      expect(plugin_state!.folded.has(r.heading_pos)).toBe(true);
    }
  });

  it("expand_all clears all folds", () => {
    let state = create_state_with_plugin(
      make_heading(1, "A"),
      make_paragraph("a"),
    );
    state = state.apply(
      state.tr.setMeta(heading_fold_plugin_key, { action: "collapse_all" }),
    );
    state = state.apply(
      state.tr.setMeta(heading_fold_plugin_key, { action: "expand_all" }),
    );
    const plugin_state = heading_fold_plugin_key.getState(state);

    expect(plugin_state!.folded.size).toBe(0);
  });

  it("fold state does not mark document as changed", () => {
    const state = create_state_with_plugin(
      make_heading(1, "Title"),
      make_paragraph("body"),
    );
    const tr = state.tr.setMeta(heading_fold_plugin_key, {
      action: "toggle",
      pos: 0,
    });

    expect(tr.docChanged).toBe(false);
  });

  it("restores fold state from a set of positions", () => {
    let state = create_state_with_plugin(
      make_heading(1, "A"),
      make_paragraph("a"),
      make_heading(2, "B"),
      make_paragraph("b"),
    );
    const ranges = compute_heading_ranges(state.doc);
    const h1_pos = ranges[0]!.heading_pos;

    state = state.apply(
      state.tr.setMeta(heading_fold_plugin_key, {
        action: "restore",
        folded: new Set([h1_pos]),
      }),
    );
    const plugin_state = heading_fold_plugin_key.getState(state);

    expect(plugin_state!.folded.has(h1_pos)).toBe(true);
    expect(plugin_state!.folded.size).toBe(1);
  });

  it("filters invalid positions on restore", () => {
    let state = create_state_with_plugin(
      make_heading(1, "A"),
      make_paragraph("a"),
    );
    const ranges = compute_heading_ranges(state.doc);
    const valid_pos = ranges[0]!.heading_pos;

    state = state.apply(
      state.tr.setMeta(heading_fold_plugin_key, {
        action: "restore",
        folded: new Set([valid_pos, 9999]),
      }),
    );
    const plugin_state = heading_fold_plugin_key.getState(state);

    expect(plugin_state!.folded.has(valid_pos)).toBe(true);
    expect(plugin_state!.folded.has(9999)).toBe(false);
    expect(plugin_state!.folded.size).toBe(1);
  });

  it("maps folded positions through document edits", () => {
    let state = create_state_with_plugin(
      make_heading(1, "Title"),
      make_paragraph("body"),
      make_heading(1, "Second"),
      make_paragraph("more"),
    );
    const ranges = compute_heading_ranges(state.doc);
    const second_pos = ranges[1]!.heading_pos;

    state = state.apply(
      state.tr.setMeta(heading_fold_plugin_key, {
        action: "toggle",
        pos: second_pos,
      }),
    );

    const insert_tr = state.tr.insertText("extra ", 1);
    state = state.apply(insert_tr);

    const plugin_state = heading_fold_plugin_key.getState(state);
    expect(plugin_state!.folded.size).toBe(1);

    const mapped_pos = [...plugin_state!.folded][0]!;
    const node = state.doc.resolve(mapped_pos).nodeAfter;
    expect(node?.type.name).toBe("heading");
  });
});
