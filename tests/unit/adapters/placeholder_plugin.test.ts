import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import type { DecorationSet } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_placeholder_plugin } from "$lib/features/editor/adapters/placeholder_plugin";
import { format_hotkey_for_display } from "$lib/features/hotkey";

type NodeDecoration = {
  from: number;
  to: number;
  type: { attrs: Record<string, string> };
};

function get_decorations(doc: ProseNode): NodeDecoration[] {
  const plugin = create_placeholder_plugin();
  const state = EditorState.create({ schema, doc, plugins: [plugin] });
  const set = plugin.props.decorations?.call(
    plugin,
    state,
  ) as DecorationSet | null;
  if (!set) return [];
  return set.find(0, doc.content.size) as unknown as NodeDecoration[];
}

const expected_placeholder = `Type '/' for slash commands · '@' for the reference palette · ${format_hotkey_for_display("CmdOrCtrl+Shift+P")} for the command palette`;

describe("placeholder_plugin", () => {
  it("decorates the paragraph of an empty doc", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(),
    ]);
    const decorations = get_decorations(doc);

    expect(decorations).toHaveLength(1);
    expect(decorations[0]?.from).toBe(0);
    expect(decorations[0]?.to).toBe(2);
    expect(decorations[0]?.type.attrs["class"]).toBe("is-empty");
    expect(decorations[0]?.type.attrs["data-placeholder"]).toBe(
      expected_placeholder,
    );
  });

  it("decorates the empty paragraph after a frontmatter node", () => {
    const frontmatter = schema.nodes.frontmatter.create(
      null,
      schema.text("title: note"),
    );
    const doc = schema.nodes.doc.create(null, [
      frontmatter,
      schema.nodes.paragraph.create(),
    ]);
    const decorations = get_decorations(doc);

    expect(decorations).toHaveLength(1);
    expect(decorations[0]?.from).toBe(frontmatter.nodeSize);
    expect(decorations[0]?.type.attrs["class"]).toBe("is-empty");
    expect(decorations[0]?.type.attrs["data-placeholder"]).toBe(
      expected_placeholder,
    );
  });

  it("does not decorate a doc with text content", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text("hello")),
    ]);
    expect(get_decorations(doc)).toHaveLength(0);
  });

  it("does not decorate a doc with multiple paragraphs", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(),
      schema.nodes.paragraph.create(),
    ]);
    expect(get_decorations(doc)).toHaveLength(0);
  });

  it("does not decorate a frontmatter doc with paragraph content", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.frontmatter.create(null, schema.text("title: note")),
      schema.nodes.paragraph.create(null, schema.text("body")),
    ]);
    expect(get_decorations(doc)).toHaveLength(0);
  });
});
