import type { EditorState, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import { addColumn, addRow, findTable, TableMap } from "prosemirror-tables";

export type TableContext = { pos: number; start: number; node: ProseNode };

export function find_table_at(
  view: EditorView,
  coords: { left: number; top: number },
): TableContext | null {
  const pos_info = view.posAtCoords(coords);
  if (!pos_info) return null;
  const found = findTable(view.state.doc.resolve(pos_info.pos));
  if (!found) return null;
  return { pos: found.pos, start: found.start, node: found.node };
}

function table_rect(table: TableContext) {
  const map = TableMap.get(table.node);
  return {
    map,
    tableStart: table.start,
    table: table.node,
    left: 0,
    top: 0,
    right: map.width,
    bottom: map.height,
  };
}

export function append_column(
  state: EditorState,
  table: TableContext,
): Transaction {
  const rect = table_rect(table);
  return addColumn(state.tr, rect, rect.map.width);
}

export function append_row(
  state: EditorState,
  table: TableContext,
): Transaction {
  const rect = table_rect(table);
  return addRow(state.tr, rect, rect.map.height);
}
