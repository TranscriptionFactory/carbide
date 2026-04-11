import type { Plugin } from "prosemirror-state";
import type { PluginContext, EditorExtension } from "./types";
import { create_core_extension } from "./core_extension";
import { create_math_extension } from "./math_extension";
import { create_code_block_extension } from "./code_block_extension";
import { create_image_extension } from "./image_extension";
import { create_table_extension } from "./table_extension";
import { create_task_list_extension } from "./task_list_extension";
import { create_details_extension } from "./details_extension";
import { create_heading_extension } from "./heading_extension";
import { create_marks_extension } from "./marks_extension";
import { create_link_extension } from "./link_extension";
import { create_find_extension } from "./find_extension";
import { create_wiki_link_extension } from "./wiki_link_extension";
import { create_suggest_extension } from "./suggest_extension";
import type { SlashCommandConfig } from "../adapters/slash_command_plugin";
import { create_embed_extension } from "./embed_extension";
import { create_paste_extension } from "./paste_extension";
import { create_lsp_extension } from "./lsp_extension";
import { create_toolbar_extension } from "./toolbar_extension";
import type { ToolbarConfig } from "./toolbar_extension";
import { create_image_context_menu_extension } from "./image_context_menu_extension";
import { create_block_drag_handle_extension } from "./block_drag_handle_extension";

export type AssembledExtensions = {
  plugins: Plugin[];
  on_note_path_change: (path: string) => void;
};

export function assemble_extensions(
  ctx: PluginContext,
  toolbar_config: ToolbarConfig,
  slash_config?: SlashCommandConfig,
): AssembledExtensions {
  const extensions: EditorExtension[] = [
    create_core_extension(ctx),
    create_code_block_extension(),
    create_math_extension(),
    create_details_extension(),
    create_table_extension(),
    create_image_extension(ctx),
    create_marks_extension(),
    create_link_extension(),
    create_heading_extension(),
    create_task_list_extension(),
    create_find_extension(),
    create_wiki_link_extension(ctx),
    create_suggest_extension(ctx, slash_config),
    create_embed_extension(ctx),
    create_paste_extension(ctx),
    create_lsp_extension(ctx),
    create_toolbar_extension(toolbar_config),
    create_image_context_menu_extension(),
    create_block_drag_handle_extension(),
  ];

  const plugins: Plugin[] = [];
  const note_path_callbacks: Array<(path: string) => void> = [];

  for (const ext of extensions) {
    plugins.push(...ext.plugins);
    if (ext.on_note_path_change) {
      note_path_callbacks.push(ext.on_note_path_change);
    }
  }

  return {
    plugins,
    on_note_path_change(path: string) {
      for (const cb of note_path_callbacks) cb(path);
    },
  };
}

export type { PluginContext, EditorExtension } from "./types";
export type { ResolveAssetUrlForVault } from "./types";
export {
  editor_context_plugin_key,
  outline_plugin_key,
  dirty_state_plugin_key,
} from "./core_extension";
export {
  toggle_heading_fold,
  collapse_all_headings,
  expand_all_headings,
  restore_heading_folds,
} from "./heading_extension";
export { find_highlight_plugin_key } from "./find_extension";
export {
  wiki_link_plugin_key,
  set_wiki_suggestions,
} from "./wiki_link_extension";
export {
  set_tag_suggestions,
  set_cite_suggestions,
  set_image_suggestions,
} from "./suggest_extension";
export type { CiteSuggestionItem } from "./suggest_extension";
export {
  excalidraw_embed_plugin_key,
  file_embed_plugin_key,
} from "./embed_extension";
export type { ToolbarConfig } from "./toolbar_extension";
