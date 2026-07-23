/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/markdown_pipeline";
import {
  create_table_toolbar_prose_plugin,
  set_table_layout,
} from "$lib/features/editor/adapters/table_toolbar_plugin";

const anchor_refs: HTMLElement[] = [];

vi.mock("@floating-ui/dom", () => ({
  autoUpdate: (reference: HTMLElement) => {
    anchor_refs.push(reference);
    return () => {};
  },
  computePosition: () => Promise.resolve({ x: 0, y: 0 }),
  offset: () => ({}),
  flip: () => ({}),
  shift: () => ({}),
}));

function table_doc() {
  const cell = schema.nodes.table_cell.create(
    null,
    schema.nodes.paragraph.create(null, schema.text("hi")),
  );
  const row = schema.nodes.table_row.create(null, cell);
  const table = schema.nodes.table.create(null, row);
  const trailing = schema.nodes.paragraph.create(null, schema.text("out"));
  return schema.nodes.doc.create(null, [table, trailing]);
}

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  anchor_refs.length = 0;
  document.querySelectorAll(".table-toolbar").forEach((el) => {
    el.remove();
  });
});

function mount_in_table(): EditorView {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const doc = table_doc();
  const state = EditorState.create({
    doc,
    plugins: [create_table_toolbar_prose_plugin()],
    selection: TextSelection.create(doc, 4),
  });
  const v = new EditorView(mount, { state });
  view = v;
  Object.defineProperty(v.dom, "offsetParent", {
    configurable: true,
    get: () => document.body,
  });
  v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 4)));
  return v;
}

describe("table toolbar re-anchors when the table element is replaced", () => {
  it("rebinds floating position to the fresh <table> after a layout toggle", () => {
    const v = mount_in_table();
    const table_before = v.dom.querySelector("table");
    expect(table_before).not.toBeNull();
    expect(anchor_refs).toHaveLength(1);
    expect(anchor_refs[0]).toBe(table_before);

    set_table_layout(v, "fixed");

    const table_after = v.dom.querySelector("table");
    expect(table_after).not.toBe(table_before);
    expect(anchor_refs).toHaveLength(2);
    expect(anchor_refs[1]).toBe(table_after);
  });
});
