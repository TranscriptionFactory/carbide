/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import { schema } from "$lib/features/editor/adapters/markdown_pipeline";
import {
  create_block_drag_handle_prose_plugin,
  build_drag_handle_decorations,
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
