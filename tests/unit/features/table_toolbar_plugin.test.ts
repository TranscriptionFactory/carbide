/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import { EditorState, TextSelection, Selection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/markdown_pipeline";
import { create_table_toolbar_prose_plugin } from "$lib/features/editor/adapters/table_toolbar_plugin";

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
  document.querySelectorAll(".table-toolbar").forEach((el) => {
    el.remove();
  });
});

function mount_in_table(): { view: EditorView } {
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
  return { view: v };
}

function toolbar(): HTMLElement | null {
  return document.body.querySelector(".table-toolbar");
}

describe("table toolbar focusout dismissal", () => {
  it("keeps the toolbar when focus stays inside the editor", async () => {
    const { view: v } = mount_in_table();
    expect(toolbar()).not.toBeNull();

    v.dom.setAttribute("tabindex", "0");
    v.dom.focus();
    expect(v.dom.contains(document.activeElement)).toBe(true);

    v.dom.dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: null }),
    );
    await Promise.resolve();

    expect(toolbar()).not.toBeNull();
  });

  it("removes the toolbar when focus leaves the editor and toolbar", async () => {
    const { view: v } = mount_in_table();
    expect(toolbar()).not.toBeNull();

    const outside = document.createElement("input");
    document.body.appendChild(outside);
    outside.focus();
    expect(v.dom.contains(document.activeElement)).toBe(false);

    // move selection out of the table so is_in_table is false
    v.dispatch(v.state.tr.setSelection(Selection.atEnd(v.state.doc)));

    v.dom.dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: null }),
    );
    await Promise.resolve();

    expect(toolbar()).toBeNull();
    outside.remove();
  });
});
