import type { Plugin } from "prosemirror-state";
import { create_block_drag_handle_prose_plugin } from "../adapters/block_drag_handle_plugin";
import type { SlashCommandConfig } from "../adapters/slash_command_plugin";
import type { EditorExtension } from "./types";

export function create_block_drag_handle_extension(
  insert_menu_config?: SlashCommandConfig,
): EditorExtension {
  const plugins: Plugin[] = [
    create_block_drag_handle_prose_plugin(insert_menu_config),
  ];
  return { plugins };
}
