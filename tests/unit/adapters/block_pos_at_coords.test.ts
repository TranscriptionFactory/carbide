/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import { schema } from "$lib/features/editor/adapters/schema";
import { block_pos_at_coords } from "$lib/features/editor/adapters/block_pos_at_coords";
import {
  BLOCK_NODE_MATRIX,
  make_matrix_doc,
} from "../helpers/block_node_matrix";

const views: EditorView[] = [];

function make_view(doc: ProseNode): EditorView {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const view = new EditorView(el, { state: EditorState.create({ doc }) });
  views.push(view);
  return view;
}

function stub_coords(
  view: EditorView,
  value: { pos: number; inside: number } | null,
) {
  vi.spyOn(view, "posAtCoords").mockReturnValue(value);
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("block_pos_at_coords over the block nodeview matrix", () => {
  it.each(BLOCK_NODE_MATRIX)(
    "resolves $label from the node the pointer is inside",
    ({ build, node_type }) => {
      const { doc, block_pos } = make_matrix_doc(build);
      const view = make_view(doc);
      stub_coords(view, { pos: block_pos, inside: block_pos });

      expect(block_pos_at_coords(view, 10, 10)).toBe(block_pos);
      expect(view.state.doc.nodeAt(block_pos)?.type.name).toBe(node_type);
    },
  );

  it.each(BLOCK_NODE_MATRIX)(
    "resolves $label from its rendered DOM when posAtCoords fails",
    ({ build }) => {
      const { doc, block_pos } = make_matrix_doc(build);
      const view = make_view(doc);
      stub_coords(view, null);
      const dom = view.nodeDOM(block_pos);
      if (!(dom instanceof Element)) throw new Error("node has no element DOM");

      expect(block_pos_at_coords(view, 10, 10, dom)).toBe(block_pos);
    },
  );
});

describe("block_pos_at_coords targeting rules", () => {
  it("prefers the node the pointer is inside over the surrounding position", () => {
    const { doc, block_pos } = make_matrix_doc(() =>
      schema.nodes.web_embed.create({ src: "https://example.com" }),
    );
    const view = make_view(doc);
    const following_paragraph = block_pos + 1;
    stub_coords(view, { pos: following_paragraph, inside: block_pos });

    expect(block_pos_at_coords(view, 10, 10)).toBe(block_pos);
  });

  it("falls back to the raw position when the pointer is at the top level", () => {
    const { doc, block_pos } = make_matrix_doc(() =>
      schema.nodes.paragraph.create(null, schema.text("body")),
    );
    const view = make_view(doc);
    stub_coords(view, { pos: block_pos + 1, inside: -1 });

    expect(block_pos_at_coords(view, 10, 10)).toBe(block_pos);
  });

  it("resolves a list item rather than its enclosing list", () => {
    const item = schema.nodes.list_item.create(null, [
      schema.nodes.paragraph.create(null, schema.text("one")),
    ]);
    const second = schema.nodes.list_item.create(null, [
      schema.nodes.paragraph.create(null, schema.text("two")),
    ]);
    const list = schema.nodes.bullet_list.create(null, [item, second]);
    const doc = schema.nodes.doc.create(null, [list]);
    const view = make_view(doc);
    const second_item_pos = 1 + item.nodeSize;
    stub_coords(view, {
      pos: second_item_pos + 2,
      inside: second_item_pos + 1,
    });

    expect(block_pos_at_coords(view, 10, 10)).toBe(second_item_pos);
  });

  it("returns null for frontmatter, which is not a movable block", () => {
    const frontmatter = schema.nodes.frontmatter.create(
      null,
      schema.text("title: x"),
    );
    const doc = schema.nodes.doc.create(null, [
      frontmatter,
      schema.nodes.paragraph.create(null, schema.text("body")),
    ]);
    const view = make_view(doc);
    stub_coords(view, { pos: 0, inside: 0 });

    expect(block_pos_at_coords(view, 10, 10)).toBeNull();
  });

  it("returns null when neither coordinates nor a DOM target resolve", () => {
    const { doc } = make_matrix_doc(() =>
      schema.nodes.paragraph.create(null, schema.text("body")),
    );
    const view = make_view(doc);
    stub_coords(view, null);

    expect(block_pos_at_coords(view, 10, 10)).toBeNull();
    expect(
      block_pos_at_coords(view, 10, 10, document.createElement("div")),
    ).toBeNull();
  });
});
