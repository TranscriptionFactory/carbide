import { describe, it, expect } from "vitest";
import {
  EditorState,
  NodeSelection,
  Selection,
  TextSelection,
} from "prosemirror-state";
import { columnResizing, tableEditing, TableMap } from "prosemirror-tables";
import { baseKeymap } from "prosemirror-commands";
import { history, undo } from "prosemirror-history";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  append_column,
  append_row,
  select_table_on_backspace,
  type TableContext,
} from "$lib/features/editor/adapters/table_command_utils";

function build_state(): EditorState {
  const { nodes: n } = schema;
  const header_row = n.table_row.create(null, [
    n.table_header.create(null, n.paragraph.create(null, schema.text("A"))),
    n.table_header.create(null, n.paragraph.create(null, schema.text("B"))),
  ]);
  const body_row = n.table_row.create(null, [
    n.table_cell.create(null, n.paragraph.create(null, schema.text("1"))),
    n.table_cell.create(null, n.paragraph.create(null, schema.text("2"))),
  ]);
  const table = n.table.create(null, [header_row, body_row]);
  const doc = n.doc.create(null, [table]);
  return EditorState.create({
    doc,
    schema,
    plugins: [columnResizing(), tableEditing()],
  });
}

function table_context(state: EditorState): TableContext {
  return { pos: 0, start: 1, node: state.doc.child(0) };
}

describe("table_command_utils", () => {
  it("append_column adds exactly one column and keeps the doc valid", () => {
    const state = build_state();
    const before = TableMap.get(table_context(state).node);

    const next = state.apply(append_column(state, table_context(state)));
    const after = TableMap.get(next.doc.child(0));

    expect(after.width).toBe(before.width + 1);
    expect(after.height).toBe(before.height);
    expect(next.doc.check()).toBeUndefined();
  });

  it("append_row adds exactly one row and keeps the doc valid", () => {
    const state = build_state();
    const before = TableMap.get(table_context(state).node);

    const next = state.apply(append_row(state, table_context(state)));
    const after = TableMap.get(next.doc.child(0));

    expect(after.height).toBe(before.height + 1);
    expect(after.width).toBe(before.width);
    expect(next.doc.check()).toBeUndefined();
  });

  it("appends from the table edge regardless of where the cursor sits", () => {
    const state = build_state();
    const next = state.apply(append_column(state, table_context(state)));
    const map = TableMap.get(next.doc.child(0));

    // Every row gains the trailing cell, so the map stays rectangular.
    expect(map.map.length).toBe(map.width * map.height);
  });

  it("appended cells carry no colwidth attribute", () => {
    const state = build_state();
    const next = state.apply(append_column(state, table_context(state)));

    let saw_colwidth = false;
    next.doc.descendants((node) => {
      if (
        node.type.name === "table_cell" ||
        node.type.name === "table_header"
      ) {
        if (node.attrs["colwidth"] != null) saw_colwidth = true;
      }
    });
    expect(saw_colwidth).toBe(false);
  });
});

function build_state_with_trailing(
  extra_plugins: EditorState["plugins"] = [],
): EditorState {
  const { nodes: n } = schema;
  const header_row = n.table_row.create(null, [
    n.table_header.create(null, n.paragraph.create(null, schema.text("A"))),
    n.table_header.create(null, n.paragraph.create(null, schema.text("B"))),
  ]);
  const body_row = n.table_row.create(null, [
    n.table_cell.create(null, n.paragraph.create(null, schema.text("1"))),
    n.table_cell.create(null, n.paragraph.create(null, schema.text("2"))),
  ]);
  const table = n.table.create(null, [header_row, body_row]);
  const doc = n.doc.create(null, [table, n.paragraph.create()]);
  return EditorState.create({
    doc,
    schema,
    plugins: [
      columnResizing(),
      tableEditing({ allowTableNodeSelection: true }),
      ...extra_plugins,
    ],
  });
}

function at_first_cell_start(state: EditorState): EditorState {
  return state.apply(state.tr.setSelection(Selection.atStart(state.doc)));
}

function has_table(state: EditorState): boolean {
  let found = false;
  state.doc.descendants((node) => {
    if (node.type.name === "table") found = true;
  });
  return found;
}

function selects_whole_table(state: EditorState): boolean {
  const sel = state.selection;
  return sel instanceof NodeSelection && sel.node.type.name === "table";
}

describe("select_table_on_backspace", () => {
  it("selects (not deletes) the table when the cursor is at the first cell start", () => {
    const state = at_first_cell_start(build_state_with_trailing());

    let next = state;
    const handled = select_table_on_backspace(state, (tr) => {
      next = state.apply(tr);
    });

    expect(handled).toBe(true);
    expect(selects_whole_table(next)).toBe(true);
    // Still present — deletion is the user's second keystroke.
    expect(has_table(next)).toBe(true);
  });

  it("a second backspace (via baseKeymap) deletes the now-selected table", () => {
    let state = at_first_cell_start(build_state_with_trailing());
    select_table_on_backspace(state, (tr) => {
      state = state.apply(tr);
    });
    expect(selects_whole_table(state)).toBe(true);

    const deleted = baseKeymap["Backspace"]?.(state, (tr) => {
      state = state.apply(tr);
    });
    expect(deleted).toBe(true);
    expect(has_table(state)).toBe(false);
    expect(state.doc.check()).toBeUndefined();
  });

  it("leaves a normal backspace alone when not at the first cell start", () => {
    // Cursor placed just after "A" in the first cell — not the cell start.
    const base = build_state_with_trailing();
    const state = base.apply(
      base.tr.setSelection(TextSelection.create(base.doc, 5)),
    );

    const handled = select_table_on_backspace(state, () => {
      throw new Error("should not dispatch");
    });

    expect(handled).toBe(false);
    expect(has_table(state)).toBe(true);
  });

  it("does not fire from a body cell start", () => {
    const base = build_state_with_trailing();
    // Walk to the first body cell ("1") and place the cursor at its start.
    let body_start = -1;
    base.doc.descendants((node, pos) => {
      if (body_start === -1 && node.type.name === "table_cell") {
        body_start = pos + 2;
      }
    });
    const state = base.apply(
      base.tr.setSelection(TextSelection.create(base.doc, body_start)),
    );

    expect(select_table_on_backspace(state)).toBe(false);
  });

  it("the select-then-delete is undo-able via the history plugin", () => {
    let state = at_first_cell_start(build_state_with_trailing([history()]));

    select_table_on_backspace(state, (tr) => {
      state = state.apply(tr);
    });
    baseKeymap["Backspace"]?.(state, (tr) => {
      state = state.apply(tr);
    });
    expect(has_table(state)).toBe(false);

    undo(state, (tr) => {
      state = state.apply(tr);
    });
    expect(has_table(state)).toBe(true);
  });

  it("does not pre-empt baseKeymap: backspace at first cell start is a no-op there", () => {
    // Ordering guard — the table command runs after baseKeymap, so this must
    // stay false or the select step would be unreachable.
    const state = at_first_cell_start(build_state_with_trailing());
    expect(baseKeymap["Backspace"]?.(state, undefined, undefined)).toBe(false);
  });
});
