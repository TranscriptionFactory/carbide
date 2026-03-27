import { keymap } from "prosemirror-keymap";
import type { Plugin } from "prosemirror-state";
import { goToNextCell } from "prosemirror-tables";
import { create_table_toolbar_prose_plugin } from "../adapters/table_toolbar_plugin";
import type { EditorExtension } from "./types";

export function create_table_extension(): EditorExtension {
  const plugins: Plugin[] = [
    keymap({
      Tab: goToNextCell(1),
      "Shift-Tab": goToNextCell(-1),
    }),
    create_table_toolbar_prose_plugin(),
  ];

  return { plugins };
}
