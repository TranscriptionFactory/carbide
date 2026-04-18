/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_math_view_prose_plugin } from "$lib/features/editor/adapters/math_plugin";

function make_doc_with_inline_math(content: string) {
  const math_node = schema.nodes.math_inline.create(null, schema.text(content));
  const paragraph = schema.nodes.paragraph.create(null, [
    schema.text("before "),
    math_node,
    schema.text(" after"),
  ]);
  return schema.nodes.doc.create(null, paragraph);
}

function make_view(doc: ReturnType<typeof make_doc_with_inline_math>) {
  const el = document.createElement("div");
  const state = EditorState.create({
    doc,
    plugins: [create_math_view_prose_plugin()],
  });
  return new EditorView(el, { state });
}

describe("inline math double-click to edit", () => {
  it("replaces math_inline node with raw $...$ text on double-click", () => {
    const doc = make_doc_with_inline_math("x^2");
    const view = make_view(doc);

    // math_inline starts after "before " (7 chars) inside the paragraph
    // paragraph starts at pos 1, so math node is at pos 8
    const para = view.state.doc.firstChild!;
    let math_pos = 0;
    let found = false;
    para.forEach((child, offset) => {
      if (child.type.name === "math_inline" && !found) {
        math_pos = 1 + offset; // +1 for paragraph opening
        found = true;
      }
    });
    expect(found).toBe(true);

    const math_node = view.state.doc.nodeAt(math_pos)!;
    expect(math_node.type.name).toBe("math_inline");

    const plugin = create_math_view_prose_plugin();
    const handler = plugin.props.handleDoubleClickOn!;
    const handled = handler.call(
      plugin,
      view,
      math_pos,
      math_node,
      math_pos,
      {} as MouseEvent,
      false,
    );

    expect(handled).toBe(true);

    // The math_inline node should be replaced with raw text "$x^2$"
    const text_content = view.state.doc.textContent;
    expect(text_content).toContain("$x^2$");

    // No math_inline nodes should remain at that position
    const node_at = view.state.doc.nodeAt(math_pos);
    expect(node_at?.type.name).not.toBe("math_inline");
  });

  it("places cursor before closing $", () => {
    const doc = make_doc_with_inline_math("a+b");
    const view = make_view(doc);

    const para = view.state.doc.firstChild!;
    let math_pos = 0;
    para.forEach((child, offset) => {
      if (child.type.name === "math_inline") {
        math_pos = 1 + offset;
      }
    });

    const math_node = view.state.doc.nodeAt(math_pos)!;
    const plugin = create_math_view_prose_plugin();
    const handler = plugin.props.handleDoubleClickOn!;
    handler.call(
      plugin,
      view,
      math_pos,
      math_node,
      math_pos,
      {} as MouseEvent,
      false,
    );

    const cursor = view.state.selection as TextSelection;
    // Cursor should be before the closing $
    // raw text is "$a+b$", cursor at math_pos + 4 (before closing $)
    expect(cursor.from).toBe(math_pos + 4);
  });

  it("does not handle double-click on non-math_inline nodes", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text("hello")),
    ]);
    const view = make_view(doc);

    const para = view.state.doc.firstChild!;
    const plugin = create_math_view_prose_plugin();
    const handler = plugin.props.handleDoubleClickOn!;
    const handled = handler.call(
      plugin,
      view,
      0,
      para,
      0,
      {} as MouseEvent,
      false,
    );

    expect(handled).toBe(false);
  });
});
