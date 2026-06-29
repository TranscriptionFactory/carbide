import { keymap } from "prosemirror-keymap";
import type { Plugin } from "prosemirror-state";
import { columnResizing, goToNextCell, tableEditing } from "prosemirror-tables";
import { create_table_toolbar_prose_plugin } from "../adapters/table_toolbar_plugin";
import { create_table_edge_controls_prose_plugin } from "../adapters/table_edge_controls_plugin";
import { select_table_on_backspace } from "../adapters/table_command_utils";
import type { EditorExtension } from "./types";

export function create_table_extension(): EditorExtension {
  const plugins: Plugin[] = [
    keymap({
      Tab: goToNextCell(1),
      "Shift-Tab": goToNextCell(-1),
      Backspace: select_table_on_backspace,
    }),
    columnResizing(),
    tableEditing({ allowTableNodeSelection: true }),
    create_table_toolbar_prose_plugin(),
    create_table_edge_controls_prose_plugin(),
  ];

  return { plugins };
}
