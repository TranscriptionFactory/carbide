import {
  create_assets_tauri_adapter,
  create_notes_tauri_adapter,
} from "$lib/features/note";
import {
  create_vault_tauri_adapter,
  create_vault_settings_tauri_adapter,
} from "$lib/features/vault";
import {
  create_settings_tauri_adapter,
  create_storage_tauri_adapter,
} from "$lib/features/settings";
import {
  create_search_tauri_adapter,
  create_workspace_index_tauri_adapter,
} from "$lib/features/search";
import {
  create_milkdown_editor_port,
  create_ydoc_manager,
} from "$lib/features/editor";
import { commands } from "$lib/generated/bindings";
import { create_clipboard_tauri_adapter } from "$lib/features/clipboard";
import { create_shell_tauri_adapter } from "$lib/features/shell";
import { create_git_tauri_adapter } from "$lib/features/git";
import { create_document_tauri_adapter } from "$lib/features/document";
import { create_terminal_tauri_adapter } from "$lib/features/terminal";
import { create_window_tauri_adapter } from "$lib/features/window";
import { create_watcher_tauri_adapter } from "$lib/features/watcher";
import {
  create_ai_tauri_adapter,
  create_ai_stream_adapter,
} from "$lib/features/ai";
import { create_graph_remark_adapter } from "$lib/features/graph";
import { create_bases_tauri_adapter } from "$lib/features/bases";
import { create_task_tauri_adapter } from "$lib/features/task";
import {
  PluginHostAdapter,
  PluginSettingsTauriAdapter,
} from "$lib/features/plugin";
import { create_canvas_tauri_adapter } from "$lib/features/canvas";
import { create_tag_tauri_adapter } from "$lib/features/tags";
import { create_lint_tauri_adapter } from "$lib/features/lint";
import { create_markdown_lsp_tauri_adapter } from "$lib/features/markdown_lsp";
// STT removed — archived on archive/stt-main
// import { create_stt_tauri_adapter } from "$lib/features/stt";

import { create_toolchain_tauri_adapter } from "$lib/features/toolchain";
import { create_code_lsp_tauri_adapter } from "$lib/features/code_lsp";
import { create_saved_query_tauri_adapter } from "$lib/features/query";
import { create_mcp_tauri_adapter } from "$lib/features/mcp";
import {
  create_reference_tauri_adapter,
  create_citationjs_adapter,
  create_doi_tauri_adapter,
  create_linked_source_tauri_adapter,
} from "$lib/features/reference";
import type { SlashCommand } from "$lib/features/editor";
import type { Ports } from "$lib/app/di/app_ports";
import type { VaultId, NoteId } from "$lib/shared/types/ids";

export type SlashCommandProvider = {
  get_plugin_commands: () => SlashCommand[];
  set_provider: (fn: () => SlashCommand[]) => void;
};

export function create_slash_command_provider(): SlashCommandProvider {
  let provider: (() => SlashCommand[]) | null = null;
  return {
    get_plugin_commands: () => (provider ? provider() : []),
    set_provider: (fn) => {
      provider = fn;
    },
  };
}

import type { AiInlineCommand } from "$lib/features/ai";

export type AiInlineHandler = {
  execute: ((payload: { command_id?: string; prompt?: string }) => void) | null;
  get_commands: (() => AiInlineCommand[]) | null;
  on_open_settings: (() => void) | null;
};

export function create_prod_ports(): Ports & {
  slash_command_provider: SlashCommandProvider;
  ai_inline_handler: AiInlineHandler;
} {
  const assets = create_assets_tauri_adapter();
  const vault = create_vault_tauri_adapter();
  const notes = create_notes_tauri_adapter();
  const index = create_workspace_index_tauri_adapter();
  const search = create_search_tauri_adapter();
  const settings = create_settings_tauri_adapter();
  const storage = create_storage_tauri_adapter();
  const vault_settings = create_vault_settings_tauri_adapter();
  const clipboard = create_clipboard_tauri_adapter();
  const shell = create_shell_tauri_adapter();
  const git = create_git_tauri_adapter();
  const watcher = create_watcher_tauri_adapter();
  const ai = create_ai_tauri_adapter();
  const ai_stream = create_ai_stream_adapter();
  const graph = create_graph_remark_adapter(notes, async (vault_id, path) => {
    const result = await commands.readVaultFile(vault_id, path);
    if (result.status === "ok") return result.data;
    throw new Error(result.error);
  });
  const bases = create_bases_tauri_adapter();
  const task = create_task_tauri_adapter();
  const plugin = new PluginHostAdapter();
  const plugin_settings = new PluginSettingsTauriAdapter();
  const canvas = create_canvas_tauri_adapter();
  const slash_command_provider = create_slash_command_provider();
  const ai_inline_handler: AiInlineHandler = {
    execute: null,
    get_commands: null,
    on_open_settings: null,
  };

  return {
    slash_command_provider,
    ai_inline_handler,
    vault,
    notes,
    index,
    search,
    settings,
    storage,
    vault_settings,
    assets,
    editor: create_milkdown_editor_port({
      resolve_asset_url_for_vault: (vault_id, asset_path) =>
        assets.resolve_asset_url(vault_id, asset_path),
      load_svg_preview: (vault_id, path) =>
        canvas.read_svg_preview(vault_id, path),
      ydoc_manager: create_ydoc_manager(),
      slash_config: {
        get_plugin_commands: () => slash_command_provider.get_plugin_commands(),
      },
      ai_inline_config: {
        on_execute: (payload) => ai_inline_handler.execute?.(payload),
        get_commands: () => ai_inline_handler.get_commands?.() ?? [],
        on_open_settings: () => ai_inline_handler.on_open_settings?.(),
      },
      task_port: task,
      note_embed: {
        read_note: (vault_id, note_path) =>
          notes
            .read_note(vault_id as VaultId, note_path as NoteId)
            .then((d) => d.markdown),
        subscribe_to_changes: (handler) => watcher.subscribe_fs_events(handler),
      },
    }),
    clipboard,
    shell,
    git,
    document: create_document_tauri_adapter(),
    terminal: create_terminal_tauri_adapter(),
    window: create_window_tauri_adapter(),
    watcher,
    ai,
    ai_stream,
    graph,
    bases,
    task,
    plugin,
    plugin_settings,
    canvas,
    tag: create_tag_tauri_adapter(),
    lint: create_lint_tauri_adapter(),
    markdown_lsp: create_markdown_lsp_tauri_adapter(),

    toolchain: create_toolchain_tauri_adapter(),
    code_lsp: create_code_lsp_tauri_adapter(),
    saved_query: create_saved_query_tauri_adapter(),
    reference_storage: create_reference_tauri_adapter(),
    citation: create_citationjs_adapter(),
    doi_lookup: create_doi_tauri_adapter(),
    linked_source: create_linked_source_tauri_adapter(),
    mcp: create_mcp_tauri_adapter(),
    // stt: create_stt_tauri_adapter(),
  };
}
