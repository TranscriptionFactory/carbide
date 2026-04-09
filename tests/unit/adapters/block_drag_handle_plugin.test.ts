/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import { schema } from "$lib/features/editor/adapters/markdown_pipeline";
import { create_block_drag_handle_prose_plugin } from "$lib/features/editor/adapters/block_drag_handle_plugin";

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
