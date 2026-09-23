/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { schema } from "$lib/features/editor/adapters/markdown_pipeline";
import { compute_heading_ranges } from "$lib/features/editor/adapters/heading_fold_plugin";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
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

  it("drops a fold when its own heading is deleted, without reattaching to a neighbour", () => {
    let state = create_state_with_plugin(
      make_heading(1, "A"),
      make_paragraph("pA"),
      make_heading(1, "B"),
      make_paragraph("pB"),
    );
    const ranges = compute_heading_ranges(state.doc);
    const a_pos = ranges[0]!.heading_pos;
    const b_pos = ranges[1]!.heading_pos;

    state = state.apply(
      state.tr.setMeta(heading_fold_plugin_key, {
        action: "toggle",
        pos: a_pos,
      }),
    );

    const a_node = state.doc.nodeAt(a_pos)!;
    state = state.apply(state.tr.delete(a_pos, a_pos + a_node.nodeSize));

    const plugin_state = heading_fold_plugin_key.getState(state);
    const mapped_b = b_pos - a_node.nodeSize;
    expect(plugin_state!.folded.has(mapped_b)).toBe(false);
    expect(plugin_state!.folded.size).toBe(0);
  });

  it("keeps a fold when a block is inserted at its heading position (paste-before-heading)", () => {
    let state = create_state_with_plugin(
      make_heading(1, "A"),
      make_paragraph("pA"),
      make_heading(1, "B"),
      make_paragraph("pB"),
    );
    const ranges = compute_heading_ranges(state.doc);
    const b_pos = ranges[1]!.heading_pos;

    state = state.apply(
      state.tr.setMeta(heading_fold_plugin_key, {
        action: "toggle",
        pos: b_pos,
      }),
    );

    const inserted = make_paragraph("pasted");
    state = state.apply(state.tr.insert(b_pos, inserted));

    const plugin_state = heading_fold_plugin_key.getState(state);
    const mapped_b = b_pos + inserted.nodeSize;
    expect(plugin_state!.folded.has(mapped_b)).toBe(true);
    expect(state.doc.nodeAt(mapped_b)?.type.name).toBe("heading");
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

describe("heading_fold_plugin incremental decorations", () => {
  function sections_state(count: number) {
    const blocks = [];
    for (let i = 0; i < count; i++) {
      blocks.push(
        make_heading(2, `H${String(i)}`),
        make_paragraph(`p${String(i)}`),
      );
    }
    return EditorState.create({
      doc: make_doc(...blocks),
      plugins: [create_heading_fold_prose_plugin()],
    });
  }

  function widget_specs(state: EditorState) {
    return heading_fold_plugin_key
      .getState(state)!
      .decorations.find()
      .map((d) => d.spec as object);
  }

  function first_paragraph_text_pos(state: EditorState) {
    const heading = state.doc.child(0);
    return heading.nodeSize + 1;
  }

  it("keeps the same widgets when typing inside a paragraph", () => {
    const state = sections_state(5);
    const before = widget_specs(state);
    const next = state.apply(
      state.tr.insertText("x", first_paragraph_text_pos(state)),
    );
    const after = widget_specs(next);
    expect(after).toHaveLength(5);
    expect(after.every((spec) => before.includes(spec))).toBe(true);
  });

  it("rebuilds when a heading is added", () => {
    const state = sections_state(3);
    const before = widget_specs(state);
    const next = state.apply(
      state.tr.insert(state.doc.content.size, [
        make_heading(2, "new"),
        make_paragraph("body"),
      ]),
    );
    const after = widget_specs(next);
    expect(after).toHaveLength(4);
    expect(after.some((spec) => before.includes(spec))).toBe(false);
  });

  it("rebuilds when a heading is removed", () => {
    const state = sections_state(3);
    const heading = state.doc.child(0);
    const next = state.apply(state.tr.delete(0, heading.nodeSize));
    expect(widget_specs(next)).toHaveLength(2);
  });

  it("toggles the heading under the clicked widget after positions shift", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const view = new EditorView(host, { state: sections_state(2) });
    view.dispatch(
      view.state.tr.insertText(
        "shifted ",
        first_paragraph_text_pos(view.state),
      ),
    );

    const toggles = host.querySelectorAll(".heading-fold-toggle");
    toggles[1]!.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );

    const second_heading_pos =
      view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize;
    expect([...heading_fold_plugin_key.getState(view.state)!.folded]).toEqual([
      second_heading_pos,
    ]);
    view.destroy();
    host.remove();
  });
});
