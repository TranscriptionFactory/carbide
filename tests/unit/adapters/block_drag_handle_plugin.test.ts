/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import { EditorView as EditorViewImpl } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/markdown_pipeline";
import {
  create_block_drag_handle_prose_plugin,
  build_drag_handle_decorations,
  build_handle_element,
  count_section_body_blocks,
  compute_drag_range,
  resolve_top_level_block,
  insert_paragraph_at,
  visible_handles,
} from "$lib/features/editor/adapters/block_drag_handle_plugin";
import {
  BLOCK_NODE_MATRIX,
  make_matrix_doc,
} from "../helpers/block_node_matrix";

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

  it("emits a widget per list_item and none for list containers", () => {
    const doc = nested_list_doc();
    expect(widget_positions(doc)).toEqual([1, 6, 11, 19]);
  });
});

function nested_list_doc(): ProseNode {
  return schema.nodes.doc.create(null, [
    schema.nodes.bullet_list.create(null, [
      schema.nodes.list_item.create(null, [
        schema.nodes.paragraph.create(null, schema.text("A")),
      ]),
      schema.nodes.list_item.create(null, [
        schema.nodes.paragraph.create(null, schema.text("B")),
        schema.nodes.bullet_list.create(null, [
          schema.nodes.list_item.create(null, [
            schema.nodes.paragraph.create(null, schema.text("x")),
          ]),
        ]),
      ]),
    ]),
    schema.nodes.paragraph.create(null, schema.text("tail")),
  ]);
}

describe("resolve_top_level_block", () => {
  it("resolves a position inside a nested list_item to that item", () => {
    const doc = nested_list_doc();
    const b1_before = 11;
    const inside_b1 = b1_before + 2;
    const resolved = resolve_top_level_block(view_for(doc), inside_b1);
    expect(resolved?.pos).toBe(b1_before);
    expect(resolved?.node.type.name).toBe("list_item");
  });

  it("falls back to the top-level block outside any list", () => {
    const doc = section_doc();
    const p_pos = doc.child(0).nodeSize;
    const resolved = resolve_top_level_block(view_for(doc), p_pos + 1);
    expect(resolved?.pos).toBe(p_pos);
    expect(resolved?.node.type.name).toBe("paragraph");
  });
});

function editing_view(doc: ProseNode): {
  view: EditorView;
  get_state: () => EditorState;
  focus: ReturnType<typeof vi.fn>;
} {
  let current = EditorState.create({ doc });
  const focus = vi.fn();
  const view = {
    get state() {
      return current;
    },
    dispatch(tr: Transaction) {
      current = current.apply(tr);
    },
    focus,
    dom: document.createElement("div"),
  } as unknown as EditorView;
  return { view, get_state: () => current, focus };
}

describe("insert_paragraph_at", () => {
  it.each(BLOCK_NODE_MATRIX)(
    "inserts and focuses an empty paragraph above $label",
    ({ build }) => {
      const { doc, block_pos } = make_matrix_doc(build);
      const { view, get_state, focus } = editing_view(doc);

      const from = insert_paragraph_at(view, block_pos, "above");

      expect(from).toBe(block_pos + 1);
      expect(get_state().doc.child(1).type.name).toBe("paragraph");
      expect(get_state().selection.from).toBe(from);
      expect(focus).toHaveBeenCalledTimes(1);
    },
  );

  it.each(BLOCK_NODE_MATRIX)(
    "inserts and focuses an empty paragraph below $label",
    ({ build, node_type }) => {
      const { doc, block_pos } = make_matrix_doc(build);
      const block_size = doc.child(1).nodeSize;
      const { view, get_state, focus } = editing_view(doc);

      const from = insert_paragraph_at(view, block_pos, "below");

      expect(from).toBe(block_pos + block_size + 1);
      expect(get_state().doc.child(1).type.name).toBe(node_type);
      expect(get_state().doc.child(2).type.name).toBe("paragraph");
      expect(get_state().selection.from).toBe(from);
      expect(focus).toHaveBeenCalledTimes(1);
    },
  );

  it("returns null and leaves the document alone when the position is empty", () => {
    const doc = section_doc();
    const { view, get_state, focus } = editing_view(doc);

    expect(insert_paragraph_at(view, doc.content.size, "below")).toBeNull();
    expect(get_state().doc.eq(doc)).toBe(true);
    expect(focus).not.toHaveBeenCalled();
  });
});

function paragraphs_doc(count: number): ProseNode {
  const blocks: ProseNode[] = [];
  for (let i = 0; i < count; i++) {
    blocks.push(schema.nodes.paragraph.create(null, schema.text(`p${i}`)));
  }
  return schema.nodes.doc.create(null, blocks);
}

function mount_with_handles(doc: ProseNode): EditorView {
  const host = document.createElement("div");
  host.className = "show-block-drag-handle";
  document.body.appendChild(host);
  return new EditorViewImpl(host, {
    state: EditorState.create({
      doc,
      plugins: [create_block_drag_handle_prose_plugin()],
    }),
  });
}

const ROW_PX = 20;

// jsdom has no layout: every non-widget child of the editor root is laid out
// as a 20px row, so a viewport band selects a known slice of blocks.
function stub_row_layout(root: HTMLElement) {
  const rows = new Map<Element, number>();
  for (let el = root.firstElementChild; el; el = el.nextElementSibling) {
    if (!el.classList.contains("ProseMirror-widget")) rows.set(el, rows.size);
  }
  return vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      const top = (rows.get(this) ?? 0) * ROW_PX;
      return DOMRect.fromRect({ x: 0, y: top, width: 100, height: ROW_PX });
    });
}

describe("visible_handles", () => {
  const band = { top: 405, bottom: 600 };

  function measure(count: number) {
    const view = mount_with_handles(paragraphs_doc(count));
    const rects = stub_row_layout(view.dom);
    const visible = visible_handles(view.dom, band);
    const calls = rects.mock.calls.length;
    rects.mockRestore();
    view.destroy();
    return { visible, calls };
  }

  it("maps each visible handle to the block it precedes", () => {
    const { visible } = measure(100);
    expect(visible.map(({ block }) => block.textContent)).toEqual(
      Array.from({ length: 11 }, (_, i) => `p${String(20 + i)}`),
    );
    for (const { handle } of visible) {
      expect(handle.classList.contains("block-drag-handle")).toBe(true);
    }
  });

  it("measures a bounded number of blocks regardless of document size", () => {
    const small = measure(100);
    const large = measure(2000);
    expect(large.visible).toHaveLength(small.visible.length);
    expect(large.calls).toBeLessThan(small.calls + 10);
    expect(large.calls).toBeLessThan(40);
  });
});

describe("drag handle widget reuse", () => {
  it("keeps existing handle DOM when an edit rebuilds the handle set", () => {
    const view = mount_with_handles(paragraphs_doc(20));
    const before = Array.from(view.dom.querySelectorAll(".block-drag-handle"));
    expect(before).toHaveLength(20);

    view.dispatch(
      view.state.tr.insert(
        view.state.doc.content.size,
        schema.nodes.paragraph.create(null, schema.text("new")),
      ),
    );

    const after = Array.from(view.dom.querySelectorAll(".block-drag-handle"));
    expect(after).toHaveLength(21);
    expect(after.filter((el) => before.includes(el))).toHaveLength(20);
    view.destroy();
  });
});
