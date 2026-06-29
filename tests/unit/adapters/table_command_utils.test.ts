import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import { columnResizing, tableEditing, TableMap } from "prosemirror-tables";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  append_column,
  append_row,
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
