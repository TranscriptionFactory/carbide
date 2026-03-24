import {
  create_assets_tauri_adapter,
  create_notes_tauri_adapter,
} from "$lib/features/note";
import {
  create_vault_tauri_adapter,
  create_vault_settings_tauri_adapter,
} from "$lib/features/vault";
import { create_settings_tauri_adapter } from "$lib/features/settings";
import {
  create_search_tauri_adapter,
  create_workspace_index_tauri_adapter,
} from "$lib/features/search";
import { create_milkdown_editor_port } from "$lib/features/editor";
import { create_clipboard_tauri_adapter } from "$lib/features/clipboard";
import { create_shell_tauri_adapter } from "$lib/features/shell";
import { create_git_tauri_adapter } from "$lib/features/git";
import { create_document_tauri_adapter } from "$lib/features/document";
import { create_terminal_tauri_adapter } from "$lib/features/terminal";
import { create_window_tauri_adapter } from "$lib/features/window";
import { create_watcher_tauri_adapter } from "$lib/features/watcher";
import { create_ai_tauri_adapter } from "$lib/features/ai";
import { create_graph_tauri_adapter } from "$lib/features/graph";
import { create_bases_tauri_adapter } from "$lib/features/bases";
import { create_task_tauri_adapter } from "$lib/features/task";
import {
  PluginHostAdapter,
  PluginSettingsTauriAdapter,
} from "$lib/features/plugin";
import { create_canvas_tauri_adapter } from "$lib/features/canvas";
import { create_tag_tauri_adapter } from "$lib/features/tags";
import { create_lint_tauri_adapter } from "$lib/features/lint";
import { create_iwe_tauri_adapter } from "$lib/features/iwe";
import { create_metadata_tauri_adapter } from "$lib/features/metadata";
import { create_toolchain_tauri_adapter } from "$lib/features/toolchain";
import { create_code_lsp_tauri_adapter } from "$lib/features/code_lsp";
import { create_saved_query_tauri_adapter } from "$lib/features/query";
import {
  create_reference_tauri_adapter,
  create_citationjs_adapter,
  create_doi_tauri_adapter,
} from "$lib/features/reference";
import type { Ports } from "$lib/app/di/app_ports";

export function create_prod_ports(): Ports {
  const assets = create_assets_tauri_adapter();
  const vault = create_vault_tauri_adapter();
  const notes = create_notes_tauri_adapter();
  const index = create_workspace_index_tauri_adapter();
  const search = create_search_tauri_adapter();
  const settings = create_settings_tauri_adapter();
  const vault_settings = create_vault_settings_tauri_adapter();
  const clipboard = create_clipboard_tauri_adapter();
  const shell = create_shell_tauri_adapter();
  const git = create_git_tauri_adapter();
  const watcher = create_watcher_tauri_adapter();
  const ai = create_ai_tauri_adapter();
  const graph = create_graph_tauri_adapter();
  const bases = create_bases_tauri_adapter();
  const task = create_task_tauri_adapter();
  const plugin = new PluginHostAdapter();
  const plugin_settings = new PluginSettingsTauriAdapter();
  const canvas = create_canvas_tauri_adapter();

  return {
    vault,
    notes,
    index,
    search,
    settings,
    vault_settings,
    assets,
    editor: create_milkdown_editor_port({
      resolve_asset_url_for_vault: (vault_id, asset_path) =>
        assets.resolve_asset_url(vault_id, asset_path),
      load_svg_preview: (vault_id, path) =>
        canvas.read_svg_preview(vault_id, path),
    }),
    clipboard,
    shell,
    git,
    document: create_document_tauri_adapter(),
    terminal: create_terminal_tauri_adapter(),
    window: create_window_tauri_adapter(),
    watcher,
    ai,
    graph,
    bases,
    task,
    plugin,
    plugin_settings,
    canvas,
    tag: create_tag_tauri_adapter(),
    lint: create_lint_tauri_adapter(),
    iwe: create_iwe_tauri_adapter(),
    metadata: create_metadata_tauri_adapter(),
    toolchain: create_toolchain_tauri_adapter(),
    code_lsp: create_code_lsp_tauri_adapter(),
    saved_query: create_saved_query_tauri_adapter(),
    reference_storage: create_reference_tauri_adapter(),
    citation: create_citationjs_adapter(),
    doi_lookup: create_doi_tauri_adapter(),
  };
}
