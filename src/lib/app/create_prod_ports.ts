import {
  create_assets_tauri_adapter,
  create_notes_tauri_adapter,
  carbide_file_asset_url,
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
  resolve_wiki_link_note_path,
  resolve_wiki_file_target,
} from "$lib/features/editor";
import { commands } from "$lib/generated/bindings";
import { create_clip_tauri_adapter } from "$lib/features/clip";
import { create_clipboard_tauri_adapter } from "$lib/features/clipboard";
import { create_shell_tauri_adapter } from "$lib/features/shell";
import { create_git_tauri_adapter } from "$lib/features/git";
import {
  create_document_tauri_adapter,
  create_trusted_html_tauri_adapter,
  create_reading_position_tauri_adapter,
} from "$lib/features/document";
import { create_terminal_tauri_adapter } from "$lib/features/terminal";
import { create_window_tauri_adapter } from "$lib/features/window";
import { create_watcher_tauri_adapter } from "$lib/features/watcher";
import {
  create_ai_tauri_adapter,
  create_ai_stream_adapter,
  create_ai_history_tauri_adapter,
} from "$lib/features/ai";
import { create_graph_remark_adapter } from "$lib/features/graph";
import { create_bases_tauri_adapter } from "$lib/features/bases";
import { create_types_tauri_adapter } from "$lib/features/types";
import { create_task_tauri_adapter } from "$lib/features/task";
import {
  PluginHostAdapter,
  PluginSettingsTauriAdapter,
  MarketplaceTauriAdapter,
} from "$lib/features/plugin";
import { create_canvas_tauri_adapter } from "$lib/features/canvas";
import { create_metadata_tauri_adapter } from "$lib/features/metadata";
import { create_tag_tauri_adapter } from "$lib/features/tags";
import { create_lint_tauri_adapter } from "$lib/features/lint";
import { create_markdown_lsp_tauri_adapter } from "$lib/features/markdown_lsp";
// STT removed — archived on archive/stt-main
// import { create_stt_tauri_adapter } from "$lib/features/stt";

import { create_toolchain_tauri_adapter } from "$lib/features/toolchain";
import { create_code_lsp_tauri_adapter } from "$lib/features/code_lsp";
import { create_saved_query_tauri_adapter } from "$lib/features/query";
import {
  create_agent_tauri_adapter,
  create_rag_persistence_tauri_adapter,
} from "$lib/features/rag";
import { create_mcp_tauri_adapter } from "$lib/features/mcp";
import {
  create_reference_tauri_adapter,
  create_citationjs_adapter,
  create_doi_tauri_adapter,
  create_linked_source_tauri_adapter,
} from "$lib/features/reference";
import type {
  SlashCommand,
  FrontmatterWidgetConfig,
  TagPillMenuConfig,
} from "$lib/features/editor";
import type { Ports } from "$lib/app/di/app_ports";
import type { VaultId, NoteId } from "$lib/shared/types/ids";
import type { QueryResult } from "$lib/features/query";

const EMPTY_QUERY_RESULT: QueryResult = {
  items: [],
  total: 0,
  elapsed_ms: 0,
  query_text: "",
};

const BASE_QUERY_ROW_CAP = 1000;

export type QueryRunner = {
  run: ((text: string) => Promise<QueryResult>) | null;
};

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
  query_runner: QueryRunner;
  frontmatter_widget: FrontmatterWidgetConfig;
  tag_pill_menu: TagPillMenuConfig;
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
    const result = await commands.readVaultFile(vault_id, path, null);
    if (result.status === "ok") return result.data;
    throw new Error(result.error);
  });
  const bases = create_bases_tauri_adapter();
  const types = create_types_tauri_adapter();
  const task = create_task_tauri_adapter();
  const plugin = new PluginHostAdapter();
  const plugin_settings = new PluginSettingsTauriAdapter();
  const marketplace = new MarketplaceTauriAdapter();
  const canvas = create_canvas_tauri_adapter();
  const linked_source = create_linked_source_tauri_adapter();
  const slash_command_provider = create_slash_command_provider();
  const ai_inline_handler: AiInlineHandler = {
    execute: null,
    get_commands: null,
    on_open_settings: null,
  };
  const query_runner: QueryRunner = { run: null };
  const frontmatter_widget: FrontmatterWidgetConfig = {
    metadata_store: null,
    is_enabled: () => false,
    on_update: () => {},
    on_add: () => {},
    on_remove: () => {},
    on_load_suggestions: () => {},
  };
  const tag_pill_menu: TagPillMenuConfig = {
    get_color: () => null,
    on_set_color: () => {},
    on_clear_color: () => {},
  };

  return {
    slash_command_provider,
    ai_inline_handler,
    query_runner,
    frontmatter_widget,
    tag_pill_menu,
    vault,
    notes,
    index,
    search,
    settings,
    storage,
    vault_settings,
    assets,
    editor: create_milkdown_editor_port({
      resolve_asset_url_for_vault: async (vault_id, asset_path) => {
        const path_str = String(asset_path);
        if (path_str.startsWith("@linked/")) {
          const resolved = await linked_source.resolve_linked_note_file_path(
            vault_id,
            path_str,
          );
          if (resolved) return carbide_file_asset_url(resolved);
        }
        return assets.resolve_asset_url(vault_id, asset_path);
      },
      resolve_vault_file_path: async (vault_id, target) => {
        const extension = /\.([a-zA-Z0-9]+)$/.exec(target)?.[1];
        if (!extension) return null;
        const paths = await assets.list_files_by_extension(vault_id, extension);
        return resolve_wiki_file_target(target, paths) ?? null;
      },
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
      frontmatter_widget,
      tag_pill_menu,
      task_port: task,
      run_query: (text) =>
        query_runner.run?.(text) ?? Promise.resolve(EMPTY_QUERY_RESULT),
      get_links: (vault_id, note_path) =>
        search.get_note_links_snapshot(vault_id, note_path),
      run_base_query: async (vault_id, text) => {
        const result = query_runner.run
          ? await query_runner.run(text)
          : EMPTY_QUERY_RESULT;
        const [results, available_properties] = await Promise.all([
          bases.query(vault_id, {
            filters: [],
            sort: [],
            limit: BASE_QUERY_ROW_CAP,
            offset: 0,
          }),
          bases.list_properties(vault_id),
        ]);
        const by_path = new Map(
          results.rows.map((row) => [row.note.path, row]),
        );
        const rows = result.items
          .map((item) => by_path.get(item.note.path))
          .filter((row): row is NonNullable<typeof row> => row !== undefined)
          .slice(0, BASE_QUERY_ROW_CAP);
        return { rows, available_properties, total: result.items.length };
      },
      subscribe_to_changes: (handler) => watcher.subscribe_fs_events(handler),
      note_embed: {
        read_note: async (vault_id, note_path) => {
          const vid = vault_id as VaultId;
          try {
            const doc = await notes.read_note(vid, note_path as NoteId);
            return doc.markdown;
          } catch (error) {
            const metas = await notes.list_notes(vid);
            const resolved = resolve_wiki_link_note_path(
              note_path,
              metas.map((meta) => meta.path),
            );
            if (!resolved) return null;
            if (resolved === note_path) throw error;
            const doc = await notes.read_note(vid, resolved as NoteId);
            return doc.markdown;
          }
        },
        subscribe_to_changes: (handler) => watcher.subscribe_fs_events(handler),
      },
    }),
    clipboard,
    clip: create_clip_tauri_adapter(),
    shell,
    git,
    document: create_document_tauri_adapter(),
    trusted_html: create_trusted_html_tauri_adapter(),
    reading_position: create_reading_position_tauri_adapter(),
    terminal: create_terminal_tauri_adapter(),
    window: create_window_tauri_adapter(),
    watcher,
    ai,
    ai_stream,
    ai_history: create_ai_history_tauri_adapter(),
    graph,
    bases,
    types,
    task,
    plugin,
    plugin_settings,
    marketplace,
    canvas,
    metadata: create_metadata_tauri_adapter(),
    tag: create_tag_tauri_adapter(),
    lint: create_lint_tauri_adapter(),
    markdown_lsp: create_markdown_lsp_tauri_adapter(),

    toolchain: create_toolchain_tauri_adapter(),
    code_lsp: create_code_lsp_tauri_adapter(),
    saved_query: create_saved_query_tauri_adapter(),
    rag_persistence: create_rag_persistence_tauri_adapter(),
    agent: create_agent_tauri_adapter(),
    reference_storage: create_reference_tauri_adapter(),
    citation: create_citationjs_adapter(),
    doi_lookup: create_doi_tauri_adapter(),
    linked_source,
    mcp: create_mcp_tauri_adapter(),
    // stt: create_stt_tauri_adapter(),
  };
}
