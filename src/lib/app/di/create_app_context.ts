import type { Ports } from "$lib/app/di/app_ports";
import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { register_actions } from "$lib/app/action_registry/register_actions";
import type { AppMountConfig } from "$lib/features/vault";
import { VaultService } from "$lib/features/vault";
import { NoteService } from "$lib/features/note";
import { FolderService } from "$lib/features/folder";
import { SettingsService } from "$lib/features/settings";
import { SearchService } from "$lib/features/search";
import { build_command_context } from "$lib/features/search/domain/build_command_context";
import {
  EditorService,
  type EditorServiceCallbacks,
} from "$lib/features/editor";
import { ClipboardService } from "$lib/features/clipboard";
import { ShellService } from "$lib/features/shell";
import { TabService } from "$lib/features/tab";
import { GitService } from "$lib/features/git";
import { HotkeyService } from "$lib/features/hotkey";
import { ThemeService } from "$lib/features/theme";
import {
  LinkRepairService,
  LinksService,
  register_links_actions,
} from "$lib/features/links";
import { SecondaryEditorManager } from "$lib/features/tab";
import {
  register_terminal_actions,
  TerminalService,
} from "$lib/features/terminal";
import {
  DocumentService,
  register_document_actions,
} from "$lib/features/document";
import { GraphService, register_graph_actions } from "$lib/features/graph";
import { register_window_actions } from "$lib/features/window";
import { AiService, register_ai_actions } from "$lib/features/ai";
import {
  BasesService,
  BasesPanel,
  register_bases_actions,
} from "$lib/features/bases";
import { WatcherService } from "$lib/features/watcher";
import { TaskService, register_task_actions } from "$lib/features/task";
import {
  PluginService,
  PluginSettingsService,
  register_plugin_actions,
} from "$lib/features/plugin";
import { CanvasService, register_canvas_actions } from "$lib/features/canvas";
import { TagService, register_tag_actions } from "$lib/features/tags";
import { LintService, register_lint_actions } from "$lib/features/lint";
import { CodeLspService } from "$lib/features/code_lsp";
import { MarksmanService } from "$lib/features/marksman";
import { register_lsp_actions } from "$lib/features/lsp";
import { register_iwe_actions } from "$lib/features/marksman";
import {
  ToolchainService,
  register_toolchain_actions,
} from "$lib/features/toolchain";
import { QueryService, register_query_actions } from "$lib/features/query";
import { register_vim_nav_actions } from "$lib/features/vim_nav";
import { set_log_entry_callback } from "$lib/shared/utils/logger";
import {
  MetadataService,
  register_metadata_actions,
} from "$lib/features/metadata";
import {
  ReferenceService,
  register_reference_actions,
  CitationPicker,
} from "$lib/features/reference";
import {
  ZoteroBbtExtension,
  create_zotero_bbt_adapter,
} from "$lib/features/zotero_bbt";
import { PluginManager } from "$lib/features/plugin";
import { CanvasPanel } from "$lib/features/canvas";
import { mount_reactors } from "$lib/reactors";
import { Blocks, PencilRuler, BookMarked, Table } from "@lucide/svelte";
import { create_workspace_reconcile } from "$lib/app/orchestration/workspace_reconcile";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import type { DiagnosticSource } from "$lib/features/diagnostics";
import { apply_workspace_edit_result } from "$lib/features/lsp";

export type AppContext = ReturnType<typeof create_app_context>;

export function create_app_context(input: {
  ports: Ports;
  now_ms?: () => number;
  default_mount_config: AppMountConfig;
}) {
  const now_ms = input.now_ms ?? (() => Date.now());
  const stores = create_app_stores();
  function require_vault() {
    const vault = stores.vault.vault;
    if (!vault) throw new Error("No active vault");
    return vault;
  }
  set_log_entry_callback((entry) => stores.log.push(entry));
  const action_registry = new ActionRegistry();
  const workspace_reconcile = create_workspace_reconcile(
    action_registry,
    () => stores.vault.is_vault_mode,
  );

  const plugin_settings_service = new PluginSettingsService(
    stores.plugin_settings,
    stores.vault,
    input.ports.plugin_settings,
  );

  const plugin_service = new PluginService(
    stores.plugin,
    stores.vault,
    input.ports.plugin,
  );

  plugin_service.set_settings_service(
    plugin_settings_service,
    stores.plugin_settings,
  );

  plugin_service.on_plugin_cleanup((plugin_id) => {
    stores.diagnostics.clear_source(`plugin:${plugin_id}` as DiagnosticSource);
  });

  plugin_service.register_sidebar_view({
    id: "canvases",
    label: "Canvases",
    icon: PencilRuler,
    panel: CanvasPanel,
  });

  plugin_service.register_sidebar_view({
    id: "plugins",
    label: "Plugins",
    icon: Blocks,
    panel: PluginManager,
  });

  plugin_service.register_sidebar_view({
    id: "references",
    label: "References",
    icon: BookMarked,
    panel: CitationPicker,
  });

  plugin_service.register_sidebar_view({
    id: "bases",
    label: "Bases",
    icon: Table,
    panel: BasesPanel,
  });

  const search_service = new SearchService(
    input.ports.search,
    stores.vault,
    stores.op,
    now_ms,
    (command) => {
      if (command.id === "ai_assistant") {
        return stores.ui.editor_settings.ai_enabled;
      }
      if (
        command.id === "toggle_tasks_panel" ||
        command.id === "quick_capture_task" ||
        command.id === "show_tasks_list" ||
        command.id === "show_tasks_kanban" ||
        command.id === "show_tasks_schedule"
      ) {
        return stores.vault.is_vault_mode;
      }
      return true;
    },
    input.ports.index,
    stores.plugin,
    () =>
      build_command_context({
        editor: stores.editor,
        git: stores.git,
        ai: stores.ai,
        ui: stores.ui,
      }),
  );

  const editor_callbacks: EditorServiceCallbacks = {
    on_internal_link_click: (raw_path, base_note_path, source) =>
      void action_registry.execute(ACTION_IDS.note_open_wiki_link, {
        raw_path,
        base_note_path,
        source,
      }),
    on_external_link_click: (url) =>
      void action_registry.execute(ACTION_IDS.shell_open_url, url),
    on_image_paste_requested: (note_id, note_path, image) =>
      void action_registry.execute(ACTION_IDS.note_request_image_paste, {
        note_id,
        note_path,
        image,
      }),
    on_file_drop_requested: (note_id, note_path, file) =>
      void action_registry.execute(ACTION_IDS.note_insert_dropped_file, {
        note_id,
        note_path,
        image: file,
      }),
    on_marksman_hover: async (file_path, line, character) => {
      const vault_id = stores.vault.vault?.id;
      if (!vault_id || stores.marksman.status !== "running") return null;
      try {
        return await input.ports.marksman.hover(
          vault_id,
          file_path,
          line,
          character,
        );
      } catch {
        return null;
      }
    },
    on_marksman_definition: async (file_path, line, character) => {
      const vault_id = stores.vault.vault?.id;
      if (!vault_id || stores.marksman.status !== "running") return [];
      try {
        return await input.ports.marksman.definition(
          vault_id,
          file_path,
          line,
          character,
        );
      } catch {
        return [];
      }
    },
    on_marksman_definition_navigate: (uri: string) => {
      const vault_path = stores.vault.vault?.path;
      if (!vault_path) return;
      let decoded: string;
      try {
        decoded = decodeURI(uri);
      } catch {
        decoded = uri;
      }
      const prefix = `file://${vault_path}/`;
      if (!decoded.startsWith(prefix)) return;
      const relative_path = decoded.slice(prefix.length);
      void action_registry.execute(ACTION_IDS.note_open, relative_path);
    },
    get_marksman_completion_trigger_characters: () =>
      stores.marksman.completion_trigger_characters,
    on_marksman_completion: async (file_path, line, character) => {
      const vault_id = stores.vault.vault?.id;
      if (!vault_id || stores.marksman.status !== "running") return [];
      try {
        return await input.ports.marksman.completion(
          vault_id,
          file_path,
          line,
          character,
        );
      } catch {
        return [];
      }
    },
    on_marksman_inlay_hints: async (file_path) => {
      const vault_id = stores.vault.vault?.id;
      if (!vault_id || stores.marksman.status !== "running") return [];
      try {
        return await input.ports.marksman.inlay_hints(vault_id, file_path);
      } catch {
        return [];
      }
    },
    on_marksman_code_actions: async (
      file_path,
      start_line,
      start_character,
      end_line,
      end_character,
    ) => {
      const vault_id = stores.vault.vault?.id;
      if (!vault_id || stores.marksman.status !== "running") return [];
      try {
        const actions = await input.ports.marksman.code_actions(
          vault_id,
          file_path,
          start_line,
          start_character,
          end_line,
          end_character,
        );
        stores.marksman.set_code_actions(actions);
        return actions;
      } catch {
        stores.marksman.set_code_actions([]);
        return [];
      }
    },
    on_marksman_code_action_resolve: (action) => {
      void action_registry.execute(
        ACTION_IDS.marksman_code_action_resolve,
        action,
      );
    },
    on_lsp_code_actions: async (
      file_path,
      start_line,
      start_character,
      end_line,
      end_character,
    ) => {
      const all_actions: Array<{
        title: string;
        kind: string | null;
        data: string | null;
        raw_json: string;
        source: string;
      }> = [];

      const vault_id = stores.vault.vault?.id;
      if (vault_id && stores.marksman.status === "running") {
        try {
          const marksman_actions = await input.ports.marksman.code_actions(
            vault_id,
            file_path,
            start_line,
            start_character,
            end_line,
            end_character,
          );
          const source =
            stores.ui.editor_settings.markdown_lsp_provider === "iwes"
              ? "IWE"
              : "Marksman";
          all_actions.push(...marksman_actions.map((a) => ({ ...a, source })));
        } catch {
          /* ignore */
        }
      }

      stores.lsp.set_code_actions(all_actions);
      return all_actions;
    },
    on_lsp_code_action_resolve: (action) => {
      void action_registry.execute(ACTION_IDS.lsp_code_action_resolve, action);
    },
  };

  const editor_service = new EditorService(
    input.ports.editor,
    stores.vault,
    stores.editor,
    stores.op,
    editor_callbacks,
    search_service,
    stores.outline,
    input.ports.assets,
    input.ports.tag,
    stores.reference,
  );

  const settings_service = new SettingsService(
    input.ports.vault_settings,
    input.ports.settings,
    stores.vault,
    stores.op,
    now_ms,
  );

  const watcher_service = new WatcherService(input.ports.watcher);

  const link_repair_service = new LinkRepairService(
    input.ports.notes,
    input.ports.search,
    input.ports.index,
    stores.editor,
    stores.tab,
    now_ms,
    (path) => {
      editor_service.close_buffer(path);
    },
    (path) => {
      watcher_service.suppress_next(path);
    },
  );

  const folder_service = new FolderService(
    input.ports.notes,
    input.ports.index,
    stores.vault,
    stores.notes,
    stores.editor,
    stores.tab,
    stores.op,
    now_ms,
    link_repair_service,
    watcher_service,
  );

  const shell_service = new ShellService(input.ports.shell);

  const clipboard_service = new ClipboardService(
    input.ports.clipboard,
    stores.editor,
    stores.op,
    now_ms,
  );

  const git_service = new GitService(
    input.ports.git,
    stores.vault,
    stores.git,
    stores.op,
    now_ms,
  );

  const links_service = new LinksService(
    input.ports.search,
    stores.vault,
    stores.links,
    input.ports.marksman,
    stores.marksman,
  );

  const hotkey_service = new HotkeyService(
    input.ports.settings,
    stores.op,
    now_ms,
  );

  const theme_service = new ThemeService(
    input.ports.settings,
    stores.op,
    now_ms,
  );

  const vault_service = new VaultService(
    input.ports.vault,
    input.ports.notes,
    input.ports.index,
    input.ports.settings,
    input.ports.vault_settings,
    stores.vault,
    stores.notes,
    stores.editor,
    stores.op,
    stores.search,
    now_ms,
  );

  const secondary_editor_manager = new SecondaryEditorManager(
    input.ports.editor,
    stores.vault,
    stores.op,
    stores.tab,
    editor_callbacks,
  );

  const note_service = new NoteService(
    input.ports.notes,
    input.ports.index,
    input.ports.assets,
    stores.vault,
    stores.notes,
    stores.editor,
    stores.op,
    editor_service,
    now_ms,
    link_repair_service,
    (path) => {
      watcher_service.suppress_next(path);
    },
    secondary_editor_manager,
    stores.parsed_note_cache,
    stores.diagnostics,
  );

  const tab_service = new TabService(
    input.ports.vault_settings,
    stores.vault,
    stores.tab,
    stores.notes,
    note_service,
  );

  const document_service = new DocumentService(
    input.ports.document,
    stores.vault,
    stores.document,
    now_ms,
  );

  const terminal_service = new TerminalService(
    input.ports.terminal,
    stores.terminal,
  );

  const lint_service = new LintService(
    input.ports.lint,
    stores.lint,
    stores.vault,
    stores.editor,
    stores.op,
    stores.diagnostics,
  );

  const code_lsp_service = new CodeLspService(
    input.ports.code_lsp,
    stores.code_lsp,
    stores.diagnostics,
  );
  code_lsp_service.start();

  const marksman_service = new MarksmanService(
    input.ports.marksman,
    stores.marksman,
    stores.vault,
    stores.diagnostics,
  );

  const graph_service = new GraphService(
    input.ports.graph,
    input.ports.search,
    stores.vault,
    stores.editor,
    stores.graph,
  );

  const ai_service = new AiService(input.ports.ai, stores.vault);

  const bases_service = new BasesService(input.ports.bases, stores.bases);

  const task_service = new TaskService(
    input.ports.task,
    stores.task,
    stores.vault,
    stores.editor,
    (line_number, status) =>
      editor_service.update_task_checkbox(line_number, status),
  );

  const canvas_service = new CanvasService(
    input.ports.canvas,
    stores.vault,
    stores.canvas,
    stores.op,
    now_ms,
  );

  const tag_service = new TagService(input.ports.tag, stores.tag, stores.vault);

  const metadata_service = new MetadataService(stores.metadata, stores.editor);

  const toolchain_service = new ToolchainService(
    input.ports.toolchain,
    stores.toolchain,
  );

  const query_service = new QueryService(
    {
      search: input.ports.search,
      index: input.ports.index,
      tags: input.ports.tag,
      bases: input.ports.bases,
    },
    stores.query,
    stores.vault,
    input.ports.saved_query,
    stores.op,
  );

  const reference_service = new ReferenceService(
    input.ports.reference_storage,
    stores.reference,
    stores.vault,
    stores.op,
    now_ms,
    input.ports.citation,
    input.ports.doi_lookup,
    input.ports.linked_source,
    input.ports.vault_settings,
  );

  const zotero_bbt_extension = new ZoteroBbtExtension(
    create_zotero_bbt_adapter(),
  );
  reference_service.register_extension(zotero_bbt_extension);

  const base_action_input = {
    registry: action_registry,
    workspace_reconcile,
    stores: {
      ui: stores.ui,
      vault: stores.vault,
      notes: stores.notes,
      editor: stores.editor,
      op: stores.op,
      search: stores.search,
      tab: stores.tab,
      git: stores.git,
      outline: stores.outline,
      graph: stores.graph,
      bases: stores.bases,
      task: stores.task,
      parsed_note_cache: stores.parsed_note_cache,
      reference: stores.reference,
    },
    services: {
      vault: vault_service,
      note: note_service,
      folder: folder_service,
      settings: settings_service,
      search: search_service,
      editor: editor_service,
      clipboard: clipboard_service,
      shell: shell_service,
      tab: tab_service,
      git: git_service,
      hotkey: hotkey_service,
      theme: theme_service,
      bases: bases_service,
      task: task_service,
      plugin: plugin_service,
      plugin_settings: plugin_settings_service,
      reference: reference_service,
    },
    default_mount_config: input.default_mount_config,
  };

  register_actions(base_action_input);

  register_links_actions(action_registry, editor_service);

  plugin_service.initialize_rpc({
    services: {
      note: {
        async read_note(note_path) {
          const vault = stores.vault.vault;
          if (!vault) throw new Error("No active vault");
          return input.ports.notes.read_note(vault.id, as_note_path(note_path));
        },
        async create_note(note_path, markdown) {
          const vault = stores.vault.vault;
          if (!vault) throw new Error("No active vault");
          const note = await input.ports.notes.create_note(
            vault.id,
            as_note_path(note_path),
            as_markdown_text(markdown),
          );
          stores.notes.add_note(note);
          await input.ports.index.upsert_note(vault.id, note.path);
          return note;
        },
        async write_note(note_path, markdown) {
          const vault = stores.vault.vault;
          if (!vault) throw new Error("No active vault");
          return input.ports.notes.write_and_index_note(
            vault.id,
            as_note_path(note_path),
            as_markdown_text(markdown),
          );
        },
        async delete_note(note_path) {
          const note = stores.notes.notes.find(
            (entry) => entry.path === note_path,
          );
          if (!note) throw new Error("Note not found");
          return note_service.delete_note(note);
        },
      },
      editor: editor_service,
      plugin: plugin_service,
    },
    stores: {
      notes: stores.notes,
      editor: stores.editor,
    },
    search: {
      async fts(query, limit) {
        const vault = require_vault();
        const hits = await input.ports.search.search_notes(
          vault.id,
          { raw: query, text: query, scope: "content", domain: "notes" },
          limit,
        );
        return hits.map((h) => ({ path: h.note.path, score: h.score }));
      },
      async tags() {
        return input.ports.tag.list_all_tags(require_vault().id);
      },
      async notes_for_tag(tag) {
        return input.ports.tag.get_notes_for_tag(require_vault().id, tag);
      },
    },
    diagnostics: {
      push(source_id, file_path, diagnostics) {
        const source = source_id as DiagnosticSource;
        stores.diagnostics.push(source, file_path, diagnostics);
      },
      clear(source_id, file_path) {
        const source = source_id as DiagnosticSource;
        if (file_path) {
          stores.diagnostics.clear_file(source, file_path);
        } else {
          stores.diagnostics.clear_source(source);
        }
      },
    },
    metadata: {
      async query(query: import("$lib/features/bases").BaseQuery) {
        return input.ports.bases.query(require_vault().id, query);
      },
      async list_properties() {
        return input.ports.bases.list_properties(require_vault().id);
      },
      async get_backlinks(note_path) {
        const snapshot = await input.ports.search.get_note_links_snapshot(
          require_vault().id,
          note_path,
        );
        return snapshot.backlinks.map((n) => ({ path: n.path }));
      },
      async get_stats(note_path) {
        return input.ports.search.get_note_stats(require_vault().id, note_path);
      },
    },
  });

  register_plugin_actions(base_action_input, plugin_service);

  register_terminal_actions({
    ...base_action_input,
    terminal_store: stores.terminal,
    terminal_service,
    ui_store: stores.ui,
  });

  register_document_actions({
    ...base_action_input,
    document_service,
  });

  register_window_actions({
    ...base_action_input,
    window_port: input.ports.window,
  });

  register_ai_actions({
    ...base_action_input,
    ai_store: stores.ai,
    ai_service,
  });

  register_graph_actions({
    ...base_action_input,
    graph_store: stores.graph,
    graph_service,
  });

  register_canvas_actions({
    ...base_action_input,
    canvas_service,
  });

  register_tag_actions(action_registry, tag_service, stores.tag, stores.ui);
  register_metadata_actions(
    action_registry,
    metadata_service,
    stores.metadata,
    stores.ui,
  );

  register_reference_actions({
    registry: action_registry,
    reference_service,
    reference_store: stores.reference,
    editor_service,
    ui_store: stores.ui,
  });

  register_lint_actions({
    registry: action_registry,
    lint_service,
    lint_store: stores.lint,
    editor_store: stores.editor,
    editor_service,
    ui_store: stores.ui,
    diagnostics_store: stores.diagnostics,
  });

  const workspace_edit_deps = {
    note_service,
    editor_service,
    editor_store: stores.editor,
    tab_store: stores.tab,
    tab_service,
    action_registry,
    op_store: stores.op,
    watcher_service,
    workspace_reconcile,
    is_vault_mode: () => stores.vault.is_vault_mode,
    read_note_content: async (path: string) => {
      const vault_id = stores.vault.vault?.id;
      if (!vault_id) throw new Error("No vault open");
      const doc = await input.ports.notes.read_note(
        vault_id,
        as_note_path(path),
      );
      return doc.markdown;
    },
    uri_to_path: (uri: string) => {
      const vault_path = stores.vault.vault?.path;
      if (!vault_path) return null;
      let decoded: string;
      try {
        decoded = decodeURI(uri);
      } catch {
        decoded = uri;
      }
      const prefix = `file://${vault_path}`;
      if (!decoded.startsWith(prefix)) return null;
      let relative = decoded.slice(prefix.length);
      if (relative.startsWith("/")) relative = relative.slice(1);
      return relative;
    },
  };

  action_registry.register({
    id: ACTION_IDS.marksman_code_action_resolve,
    label: "Marksman: Resolve Code Action",
    execute: async (action) => {
      const result = await marksman_service.code_action_resolve(
        (action as { raw_json: string }).raw_json,
      );
      if (result) {
        await apply_workspace_edit_result(result, workspace_edit_deps);
      }
    },
  });

  register_lsp_actions({
    registry: action_registry,
    lsp_store: stores.lsp,
    editor_store: stores.editor,
    editor_service,
    note_service,
    diagnostics_store: stores.diagnostics,
    ui_store: stores.ui,
    op_store: stores.op,
    marksman_service,
    workspace_edit_deps,
  });

  register_iwe_actions({
    registry: action_registry,
    editor_store: stores.editor,
    marksman_store: stores.marksman,
    marksman_service,
    ui_store: stores.ui,
    workspace_edit_deps,
    command_sink: {
      register: (cmd) => {
        stores.plugin.register_command(cmd);
      },
      unregister: (id) => {
        stores.plugin.unregister_command(id);
      },
    },
  });

  register_toolchain_actions({
    registry: action_registry,
    toolchain_service,
  });

  register_bases_actions(
    action_registry,
    bases_service,
    stores.bases,
    stores.vault,
    stores.ui,
  );

  register_task_actions(action_registry, task_service, stores.task, stores.ui);

  register_query_actions(action_registry, query_service, stores.ui);

  register_vim_nav_actions({
    registry: action_registry,
    ui_store: stores.ui,
    notes_store: stores.notes,
    outline_store: stores.outline,
    vim_nav_store: stores.vim_nav,
  });

  const cleanup_reactors = mount_reactors({
    editor_store: stores.editor,
    ui_store: stores.ui,
    op_store: stores.op,
    notes_store: stores.notes,
    search_store: stores.search,
    vault_store: stores.vault,
    tab_store: stores.tab,
    git_store: stores.git,
    terminal_store: stores.terminal,
    links_store: stores.links,
    graph_store: stores.graph,
    bases_store: stores.bases,
    editor_service,
    note_service,
    vault_service,
    settings_service,
    tab_service,
    git_service,
    links_service,
    terminal_service,
    graph_service,
    bases_service,
    watcher_service,
    action_registry,
    workspace_reconcile,
    secondary_editor_manager,
    document_service,
    task_service,
    plugin_service,
    workspace_index_port: input.ports.index,
    lint_store: stores.lint,
    lint_service,
    marksman_store: stores.marksman,
    marksman_service,
    diagnostics_store: stores.diagnostics,
    metadata_store: stores.metadata,
    metadata_service,
    toolchain_service,
    document_store: stores.document,
    code_lsp_service,
    theme_service,
    reference_service,
    reference_store: stores.reference,
  });

  return {
    ports: input.ports,
    stores,
    services: base_action_input.services,
    action_registry,
    secondary_editor_manager,
    terminal_runtime: terminal_service,
    destroy: () => {
      cleanup_reactors();
      plugin_service.destroy();
      terminal_service.destroy();
      secondary_editor_manager.destroy();
      editor_service.unmount();
      void watcher_service.stop();
      void lint_service.stop();
      void marksman_service.stop();
      code_lsp_service.stop();
      toolchain_service.dispose();
    },
  };
}
