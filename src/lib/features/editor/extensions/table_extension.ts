import type { Plugin } from "prosemirror-state";
import { create_table_toolbar_prose_plugin } from "../adapters/table_toolbar_plugin";
import type { EditorExtension } from "./types";

export function create_table_extension(): EditorExtension {
  const plugins: Plugin[] = [create_table_toolbar_prose_plugin()];

  return { plugins };
}
