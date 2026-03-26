import type { Plugin } from "prosemirror-state";
import { create_details_view_prose_plugin } from "../adapters/details_view_plugin";
import { create_details_keymap_prose_plugin } from "../adapters/details_keymap_plugin";
import type { EditorExtension } from "./types";

export function create_details_extension(): EditorExtension {
  const plugins: Plugin[] = [
    create_details_view_prose_plugin(),
    create_details_keymap_prose_plugin(),
  ];

  return { plugins };
}
