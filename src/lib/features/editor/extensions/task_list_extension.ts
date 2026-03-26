import type { Plugin } from "prosemirror-state";
import { create_task_keymap_prose_plugin } from "../adapters/task_keymap_plugin";
import type { EditorExtension } from "./types";

export function create_task_list_extension(): EditorExtension {
  const plugins: Plugin[] = [create_task_keymap_prose_plugin()];

  return { plugins };
}
