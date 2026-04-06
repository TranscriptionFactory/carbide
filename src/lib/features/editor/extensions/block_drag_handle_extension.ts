import type { Plugin } from "prosemirror-state";
import { create_block_drag_handle_prose_plugin } from "../adapters/block_drag_handle_plugin";
import type { EditorExtension } from "./types";

export function create_block_drag_handle_extension(): EditorExtension {
  const plugins: Plugin[] = [create_block_drag_handle_prose_plugin()];
  return { plugins };
}
