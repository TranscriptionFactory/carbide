import { describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { schema } from "$lib/features/editor/adapters/schema";
import { build_block_id_decorations } from "$lib/features/editor/adapters/block_id_decoration_plugin";

function state_with_selection(position: number) {
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, schema.text("claim ^abc123")),
    schema.nodes.paragraph.create(null, schema.text("other")),
  ]);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, position),
  });
}

describe("block id decorations", () => {
  it("hides a trailing block id when the caret is in another block", () => {
    const state = state_with_selection(17);
    const decorations = build_block_id_decorations(state).find();

    expect(decorations).toHaveLength(1);
    expect(decorations[0]?.from).toBe(6);
    expect(decorations[0]?.to).toBe(14);
    expect(state.doc.textContent).toContain("^abc123");
  });

  it("reveals the id while the caret is inside its block", () => {
    const state = state_with_selection(3);

    expect(build_block_id_decorations(state).find()).toHaveLength(0);
  });
});
