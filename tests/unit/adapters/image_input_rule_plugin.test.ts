import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_image_input_rule_prose_plugin } from "$lib/features/editor/adapters/image_input_rule_plugin";

function make_state(
  ...nodes: ReturnType<typeof para>[]
): EditorState {
  const plugin = create_image_input_rule_prose_plugin();
  const doc = schema.nodes.doc.create(null, nodes);
  return EditorState.create({ doc, plugins: [plugin] });
}

function para(text: string) {
  return schema.nodes.paragraph.create(
    null,
    text.length > 0 ? schema.text(text) : [],
  );
}

function para_with_inline_image(src: string) {
  const image_node = schema.nodes.image.create({ src, alt: "test" });
  return schema.nodes.paragraph.create(null, [image_node]);
}

describe("image_input_rule_plugin", () => {
  it("promotes image markdown text to image-block", () => {
    const state = make_state(para(""));
    const tr = state.tr.insertText("![alt](test.png)", 1);
    const next = state.apply(tr);
    expect(next.doc.firstChild?.type.name).toBe("image-block");
    expect(next.doc.firstChild?.attrs.src).toBe("test.png");
  });

  it("does not promote paragraph with text + image markdown", () => {
    const state = make_state(para("hello "));
    const pos = 1 + "hello ".length;
    const tr = state.tr.insertText("![alt](test.png)", pos);
    const next = state.apply(tr);
    expect(next.doc.firstChild?.type.name).toBe("paragraph");
  });

  it("promotes solo inline image node inserted into paragraph", () => {
    const state = make_state(para(""));
    const image_node = schema.nodes.image.create({
      src: "photo.png",
      alt: "test",
    });
    // Replace paragraph content with a solo inline image
    const tr = state.tr.replaceWith(1, 1, image_node);
    const next = state.apply(tr);
    expect(next.doc.firstChild?.type.name).toBe("image-block");
    expect(next.doc.firstChild?.attrs.src).toBe("photo.png");
  });

  it("promotes image even when cursor is in a different paragraph", () => {
    // This is the key regression test: cursor in paragraph 2,
    // but image paragraph 1 should still get promoted.
    const trailing = para("some text");
    const state = make_state(para(""), trailing);

    // Insert image markdown into paragraph 1, but set cursor at end
    const tr = state.tr.insertText("![alt](dropped.png)", 1);
    const next = state.apply(tr);

    // The converter should promote paragraph 1 regardless of cursor position
    expect(next.doc.firstChild?.type.name).toBe("image-block");
    expect(next.doc.firstChild?.attrs.src).toBe("dropped.png");
  });
});
