import { create_test_assets_adapter } from "./test_assets_adapter";
import { create_test_notes_adapter } from "./test_notes_adapter";
import { create_test_vault_adapter } from "./test_vault_adapter";
import { create_test_workspace_index_adapter } from "./test_workspace_index_adapter";
import { create_test_settings_adapter } from "./test_settings_adapter";
import { create_test_vault_settings_adapter } from "./test_vault_settings_adapter";
import { create_test_search_adapter } from "./test_search_adapter";
import type { Ports } from "$lib/app/di/app_ports";
import { create_milkdown_editor_port } from "$lib/features/editor";
import { create_test_clipboard_adapter } from "./test_clipboard_adapter";
import { create_test_shell_adapter } from "./test_shell_adapter";
import { create_test_git_adapter } from "./test_git_adapter";
import { create_test_document_adapter } from "./test_document_adapter";
import { create_test_terminal_adapter } from "./test_terminal_adapter";
import { create_test_window_adapter } from "./test_window_adapter";
import { create_test_watcher_adapter } from "./test_watcher_adapter";
import { create_test_graph_adapter } from "./test_graph_adapter";
import type { AiPort } from "$lib/features/ai";

function create_test_ai_adapter(): AiPort {
  return {
    check_cli: () => Promise.resolve(true),
    execute: () =>
      Promise.resolve({
        success: true,
        output: "",
        error: null,
      }),
  };
}

export function create_test_ports(): Ports {
  const assets = create_test_assets_adapter();

  return {
    vault: create_test_vault_adapter(),
    notes: create_test_notes_adapter(),
    index: create_test_workspace_index_adapter(),
    search: create_test_search_adapter(),
    settings: create_test_settings_adapter(),
    storage: {
      get_storage_stats: () =>
        Promise.resolve({
          vault_dbs: [],
          total_db_bytes: 0,
          orphaned_count: 0,
          orphaned_bytes: 0,
          embedding_cache_bytes: 0,
        }),
      cleanup_orphaned_dbs: () => Promise.resolve(0),
      clear_embedding_model_cache: () => Promise.resolve(0),
      purge_all_asset_caches: () => Promise.resolve(),
    },
    vault_settings: create_test_vault_settings_adapter(),
    assets,
    editor: create_milkdown_editor_port({
      resolve_asset_url_for_vault: (vault_id, asset_path) =>
        assets.resolve_asset_url(vault_id, asset_path),
    }),
    clipboard: create_test_clipboard_adapter(),
    shell: create_test_shell_adapter(),
    git: create_test_git_adapter(),
    document: create_test_document_adapter(),
    terminal: create_test_terminal_adapter(),
    window: create_test_window_adapter(),
    watcher: create_test_watcher_adapter(),
    ai: create_test_ai_adapter(),
    graph: create_test_graph_adapter(),
    bases: {
      list_properties: () => Promise.resolve([]),
      query: () => Promise.resolve({ rows: [], total: 0 }),
      save_view: () => Promise.resolve(),
      load_view: () => Promise.reject("Not found"),
      list_views: () => Promise.resolve([]),
      delete_view: () => Promise.resolve(),
    },
    task: {
      queryTasks: () => Promise.resolve([]),
      getTasksForNote: () => Promise.resolve([]),
      updateTaskState: () => Promise.resolve(),
      updateTaskDueDate: () => Promise.resolve(),
      createTask: () => Promise.resolve(),
    },
    plugin: {
      discover: () => Promise.resolve([]),
      load: () => Promise.resolve(),
      unload: () => Promise.resolve(),
      watch: () => Promise.resolve(),
      unwatch: () => Promise.resolve(),
      subscribe_plugin_changes: () => () => {},
    },
    plugin_settings: {
      read_settings: () => Promise.resolve({ schema_version: 1, plugins: {} }),
      write_settings: () => Promise.resolve(),
      approve_permission: () => Promise.resolve(),
      deny_permission: () => Promise.resolve(),
    },
    canvas: {
      read_file: () => Promise.resolve('{"nodes":[],"edges":[]}'),
      write_file: () => Promise.resolve(),
      read_camera: () => Promise.resolve(null),
      write_camera: () => Promise.resolve(),
      rewrite_refs_for_rename: () => Promise.resolve(0),
      read_svg_preview: () => Promise.resolve(null),
      write_svg_preview: () => Promise.resolve(),
    },
    tag: {
      list_all_tags: () => Promise.resolve([]),
      get_notes_for_tag: () => Promise.resolve([]),
      get_notes_for_tag_prefix: () => Promise.resolve([]),
    },
    lint: {
      start: () => Promise.resolve(),
      stop: () => Promise.resolve(),
      open_file: () => Promise.resolve(),
      update_file: () => Promise.resolve(),
      close_file: () => Promise.resolve(),
      format_file: () => Promise.resolve([]),
      fix_all: () => Promise.resolve(null),
      check_vault: () => Promise.resolve([]),
      format_vault: () => Promise.resolve([]),
      get_status: () => Promise.resolve("stopped" as const),
      subscribe_events: () => () => {},
    },
    markdown_lsp: {
      start: () =>
        Promise.resolve({
          completion_trigger_characters: [],
          effective_provider: "marksman",
        }),
      stop: () => Promise.resolve(),
      did_open: () => Promise.resolve(),
      did_change: () => Promise.resolve(),
      did_save: () => Promise.resolve(),
      did_close: () => Promise.resolve(),
      hover: () => Promise.resolve({ contents: null }),
      references: () => Promise.resolve([]),
      definition: () => Promise.resolve([]),
      code_actions: () => Promise.resolve([]),
      code_action_resolve: () =>
        Promise.resolve({
          files_created: [],
          files_deleted: [],
          files_modified: [],
          errors: [],
        }),
      workspace_symbols: () => Promise.resolve([]),
      rename: () =>
        Promise.resolve({
          files_created: [],
          files_deleted: [],
          files_modified: [],
          errors: [],
        }),
      prepare_rename: () => Promise.resolve(null),
      completion: () => Promise.resolve([]),
      formatting: () => Promise.resolve([]),
      inlay_hints: () => Promise.resolve([]),
      document_symbols: () => Promise.resolve([]),
      subscribe_diagnostics: () => () => {},
      subscribe_status: () => () => {},
      iwe_config_status: () =>
        Promise.resolve({
          exists: false,
          config_url: "",
          config_path: "",
          action_count: 0,
          action_names: [],
          actions: [],
        }),
      iwe_config_reset: () => Promise.resolve(),
      iwe_config_rewrite_provider: () => Promise.resolve(),
    },

    toolchain: {
      list_tools: () => Promise.resolve([]),
      install: () => Promise.resolve(),
      uninstall: () => Promise.resolve(),
      resolve: () => Promise.resolve(""),
      subscribe_events: () => () => {},
    },
    code_lsp: {
      open_file: () => Promise.resolve(),
      close_file: () => Promise.resolve(),
      stop_vault: () => Promise.resolve(),
      available_languages: () => Promise.resolve([]),
      get_status: () => Promise.resolve("stopped" as const),
      subscribe_events: () => () => {},
    },
    saved_query: {
      list: () => Promise.resolve([]),
      read: () => Promise.resolve(""),
      write: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    },
    reference_storage: {
      load_library: () => Promise.resolve({ schema_version: 1, items: [] }),
      save_library: () => Promise.resolve(),
      add_item: (_vault_id: string, item: unknown) =>
        Promise.resolve({ schema_version: 1, items: [item] as never[] }),
      remove_item: () => Promise.resolve({ schema_version: 1, items: [] }),
      save_annotation_note: () => Promise.resolve(),
      read_annotation_note: () => Promise.resolve(null),
    },
    citation: {
      parse_bibtex: () => Promise.resolve([]),
      parse_ris: () => Promise.resolve([]),
      render_citation: () => Promise.resolve(""),
      render_bibliography: () => Promise.resolve(""),
      format_bibtex: () => Promise.resolve(""),
      format_ris: () => Promise.resolve(""),
      list_styles: () => [],
    },
    doi_lookup: {
      lookup_doi: () => Promise.resolve(null),
    },
    linked_source: {
      scan_folder: () => Promise.resolve([]),
      extract_file: () =>
        Promise.resolve({
          file_path: "",
          file_name: "",
          file_type: "",
          title: null,
          author: null,
          subject: null,
          keywords: null,
          doi: null,
          isbn: null,
          arxiv_id: null,
          creation_date: null,
          body_text: "",
          page_offsets: [],
          modified_at: 0,
        }),
      list_files: () => Promise.resolve([]),
      index_content: () => Promise.resolve(),
      remove_content: () => Promise.resolve(),
      clear_source: () => Promise.resolve(),
      query_linked_notes: () => Promise.resolve([]),
      count_linked_notes: () => Promise.resolve(0),
      find_by_citekey: () => Promise.resolve(null),
      search_linked_notes: () => Promise.resolve([]),
      update_linked_metadata: () => Promise.resolve(false),
      resolve_home_dir: () => Promise.resolve("/Users/test"),
    },
    mcp: {
      start: () =>
        Promise.resolve({ status: "running" as const, transport: "stdio" }),
      stop: () => Promise.resolve(),
      get_status: () =>
        Promise.resolve({ status: "stopped" as const, transport: null }),
      setup_claude_desktop: () =>
        Promise.resolve({ success: true, path: "", message: "" }),
      setup_claude_code: () =>
        Promise.resolve({ success: true, path: "", message: "" }),
      regenerate_token: () => Promise.resolve("mock_token"),
      get_setup_status: () =>
        Promise.resolve({
          claudeDesktopConfigured: false,
          claudeCodeConfigured: false,
          httpPort: 3457,
          tokenExists: false,
          cliInstalled: false,
        }),
      install_cli: () =>
        Promise.resolve({ success: true, path: "", message: "" }),
      uninstall_cli: () =>
        Promise.resolve({ success: true, path: "", message: "" }),
    },
    // STT removed — archived on archive/stt-main
  };
}
