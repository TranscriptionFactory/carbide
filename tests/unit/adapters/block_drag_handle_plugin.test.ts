/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/markdown_pipeline";
import {
  create_block_drag_handle_prose_plugin,
  build_drag_handle_decorations,
  build_handle_element,
  count_section_body_blocks,
  compute_drag_range,
} from "$lib/features/editor/adapters/block_drag_handle_plugin";

function make_state() {
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.heading.create({ level: 1 }, schema.text("Title")),
    schema.nodes.paragraph.create(null, schema.text("body")),
  ]);
  return EditorState.create({
    doc,
    plugins: [create_block_drag_handle_prose_plugin()],
  });
}

function stub_handle(): HTMLElement {
  return document.createElement("div");
}

function widget_positions(doc: ProseNode): number[] {
  return build_drag_handle_decorations(doc, stub_handle)
    .find()
    .map((deco) => deco.from)
    .sort((a, b) => a - b);
}

describe("block_drag_handle_plugin", () => {
  it("creates without error", () => {
    const plugin = create_block_drag_handle_prose_plugin();
    expect(plugin).toBeDefined();
  });

  it("can be registered in EditorState", () => {
    const state = make_state();
    expect(state).toBeDefined();
    expect(state.plugins).toHaveLength(1);
  });
});

function section_doc(): ProseNode {
  return schema.nodes.doc.create(null, [
    schema.nodes.heading.create({ level: 1 }, schema.text("A")),
    schema.nodes.paragraph.create(null, schema.text("one")),
    schema.nodes.paragraph.create(null, schema.text("two")),
    schema.nodes.heading.create({ level: 2 }, schema.text("B")),
    schema.nodes.paragraph.create(null, schema.text("three")),
  ]);
}

function view_for(doc: ProseNode): EditorView {
  return { state: EditorState.create({ doc }) } as EditorView;
}

describe("count_section_body_blocks", () => {
  it("counts body blocks of a heading section", () => {
    const doc = section_doc();
    const h2_pos =
      doc.child(0).nodeSize + doc.child(1).nodeSize + doc.child(2).nodeSize;
    expect(count_section_body_blocks(doc, 0, h2_pos)).toBe(2);
  });

  it("returns 0 for a single-block range", () => {
    const doc = section_doc();
    const p_pos = doc.child(0).nodeSize;
    const p_end = p_pos + doc.child(1).nodeSize;
    expect(count_section_body_blocks(doc, p_pos, p_end)).toBe(0);
  });
});

describe("compute_drag_range", () => {
  it("heading range spans its section body", () => {
    const doc = section_doc();
    const h2_pos =
      doc.child(0).nodeSize + doc.child(1).nodeSize + doc.child(2).nodeSize;
    expect(compute_drag_range(view_for(doc), h2_pos)).toEqual({
      from: h2_pos,
      to: doc.content.size,
    });
  });

  it("paragraph range spans only itself", () => {
    const doc = section_doc();
    const p_pos = doc.child(0).nodeSize;
    expect(compute_drag_range(view_for(doc), p_pos)).toEqual({
      from: p_pos,
      to: p_pos + doc.child(1).nodeSize,
    });
  });
});

describe("build_handle_element", () => {
  it("exposes keyboard and a11y attributes", () => {
    const handle = build_handle_element();
    const insert_btn = handle.querySelector<HTMLElement>(
      ".block-drag-handle__insert",
    );

    expect(handle.tabIndex).toBe(0);
    expect(handle.getAttribute("role")).toBe("button");
    expect(handle.getAttribute("aria-label")).toBe("Drag to reorder block");
    expect(handle.title).toBe("Drag to move block · Click to select");

    expect(insert_btn).not.toBeNull();
    expect(insert_btn?.tabIndex).toBe(0);
    expect(insert_btn?.getAttribute("role")).toBe("button");
    expect(insert_btn?.getAttribute("aria-label")).toBe("Insert block below");
    expect(insert_btn?.title).toBe("Insert block below");
  });
});

describe("build_drag_handle_decorations", () => {
  it("emits one widget per draggable top-level block", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.heading.create({ level: 1 }, schema.text("Title")),
      schema.nodes.paragraph.create(null, schema.text("body")),
      schema.nodes.code_block.create({ language: "js" }, schema.text("x")),
    ]);
    expect(build_drag_handle_decorations(doc, stub_handle).find()).toHaveLength(
      3,
    );
  });

  it("places each widget at its block's start position", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.heading.create({ level: 1 }, schema.text("Title")),
      schema.nodes.paragraph.create(null, schema.text("body")),
    ]);
    const expected: number[] = [];
    doc.forEach((_node, offset) => expected.push(offset));
    expect(widget_positions(doc)).toEqual(expected);
  });

  it("skips non-draggable top-level blocks", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.frontmatter.create(null),
      schema.nodes.paragraph.create(null, schema.text("body")),
    ]);
    expect(build_drag_handle_decorations(doc, stub_handle).find()).toHaveLength(
      1,
    );
  });

  it("does not descend into nested blocks", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.bullet_list.create(null, [
        schema.nodes.list_item.create(null, [
          schema.nodes.paragraph.create(null, schema.text("a")),
        ]),
        schema.nodes.list_item.create(null, [
          schema.nodes.paragraph.create(null, schema.text("b")),
        ]),
      ]),
    ]);
    expect(build_drag_handle_decorations(doc, stub_handle).find()).toHaveLength(
      1,
    );
  });
});
