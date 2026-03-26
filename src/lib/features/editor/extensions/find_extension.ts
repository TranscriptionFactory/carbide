import type { Plugin } from "prosemirror-state";
import {
  find_highlight_plugin_key,
  create_find_highlight_prose_plugin,
} from "../adapters/find_highlight_plugin";
import type { EditorExtension } from "./types";

export function create_find_extension(): EditorExtension {
  const plugins: Plugin[] = [create_find_highlight_prose_plugin()];

  return { plugins };
}

export { find_highlight_plugin_key };
