import type { Plugin } from "prosemirror-state";
import { create_heading_keymap_prose_plugin } from "../adapters/heading_keymap_plugin";
import {
  create_heading_fold_prose_plugin,
  toggle_heading_fold,
  collapse_all_headings,
  expand_all_headings,
} from "../adapters/heading_fold_plugin";
import type { EditorExtension } from "./types";

export function create_heading_extension(): EditorExtension {
  const plugins: Plugin[] = [
    create_heading_keymap_prose_plugin(),
    create_heading_fold_prose_plugin(),
  ];

  return { plugins };
}

export { toggle_heading_fold, collapse_all_headings, expand_all_headings };
