import { NodeSelection, TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import {
  addColumn,
  addRow,
  cellAround,
  findTable,
  TableMap,
} from "prosemirror-tables";

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

export function select_table_on_backspace(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const { selection } = state;
  const $cursor = selection instanceof TextSelection ? selection.$cursor : null;
  if (!$cursor) return false;

  const table = findTable($cursor);
  if (!table) return false;

  const $cell = cellAround($cursor);
  if (!$cell) return false;

  // Only fire at the very start of the table's first cell, where a plain
  // backspace would otherwise be swallowed by the cell's isolating boundary.
  // Select the whole table; a second backspace (handled by baseKeymap's
  // deleteSelection) then removes it — a forgiving select-then-delete.
  if ($cursor.pos !== $cell.pos + 2) return false;
  const rect = TableMap.get(table.node).findCell($cell.pos - table.start);
  if (rect.left !== 0 || rect.top !== 0) return false;

  if (dispatch) {
    dispatch(state.tr.setSelection(NodeSelection.create(state.doc, table.pos)));
  }
  return true;
}
