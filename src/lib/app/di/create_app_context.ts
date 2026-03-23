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
import {
  SplitViewService,
  register_split_view_actions,
} from "$lib/features/split_view";
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
import { BasesService } from "$lib/features/bases";
import { WatcherService } from "$lib/features/watcher";
import { TaskService } from "$lib/features/task";
import {
  PluginService,
  PluginSettingsService,
  register_plugin_actions,
} from "$lib/features/plugin";
import { CanvasService, register_canvas_actions } from "$lib/features/canvas";
import { TagService, register_tag_actions } from "$lib/features/tags";
import { LintService, register_lint_actions } from "$lib/features/lint";
import { IweService, register_iwe_actions } from "$lib/features/iwe";
import {
  ToolchainService,
  register_toolchain_actions,
} from "$lib/features/toolchain";
import { QueryService, register_query_actions } from "$lib/features/query";
import { set_log_entry_callback } from "$lib/shared/utils/logger";
import {
  MetadataService,
  register_metadata_actions,
} from "$lib/features/metadata";
import { PluginManager } from "$lib/features/plugin";
import { CanvasPanel } from "$lib/features/canvas";
import { mount_reactors } from "$lib/reactors";
import { Blocks, PencilRuler } from "@lucide/svelte";
import { create_workspace_reconcile } from "$lib/app/orchestration/workspace_reconcile";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import type { DiagnosticSource } from "$lib/features/diagnostics";

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
    on_iwe_hover: async (file_path, line, character) => {
      const vault_id = stores.vault.vault?.id;
      if (!vault_id || stores.iwe.status !== "running") return null;
      try {
        return await input.ports.iwe.hover(
          vault_id,
          file_path,
          line,
          character,
        );
      } catch {
        return null;
      }
    },
    on_iwe_definition: async (file_path, line, character) => {
      const vault_id = stores.vault.vault?.id;
      if (!vault_id || stores.iwe.status !== "running") return [];
      try {
        return await input.ports.iwe.definition(
          vault_id,
          file_path,
          line,
          character,
        );
      } catch {
        return [];
      }
    },
    on_iwe_definition_navigate: (uri: string) => {
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
    get_iwe_completion_trigger_characters: () =>
      stores.iwe.completion_trigger_characters,
    on_iwe_completion: async (file_path, line, character) => {
      const vault_id = stores.vault.vault?.id;
      if (!vault_id || stores.iwe.status !== "running") return [];
      try {
        return await input.ports.iwe.completion(
          vault_id,
          file_path,
          line,
          character,
        );
      } catch {
        return [];
      }
    },
    on_iwe_inlay_hints: async (file_path) => {
      const vault_id = stores.vault.vault?.id;
      if (!vault_id || stores.iwe.status !== "running") return [];
      try {
        return await input.ports.iwe.inlay_hints(vault_id, file_path);
      } catch {
        return [];
      }
    },
    on_iwe_code_actions: async (
      file_path,
      start_line,
      start_character,
      end_line,
      end_character,
    ) => {
      const vault_id = stores.vault.vault?.id;
      if (!vault_id || stores.iwe.status !== "running") return [];
      try {
        return await input.ports.iwe.code_actions(
          vault_id,
          file_path,
          start_line,
          start_character,
          end_line,
          end_character,
        );
      } catch {
        return [];
      }
    },
    on_iwe_code_action_resolve: (action) => {
      void action_registry.execute(ACTION_IDS.iwe_code_action_resolve, action);
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

  const split_view_service = new SplitViewService(
    input.ports.editor,
    stores.vault,
    stores.op,
    stores.split_view,
    editor_callbacks,
    input.ports.vault_settings,
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
    split_view_service,
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

  const iwe_service = new IweService(
    input.ports.iwe,
    stores.iwe,
    stores.vault,
    stores.ui,
    stores.diagnostics,
  );

  const graph_service = new GraphService(
    input.ports.graph,
    input.ports.search,
    stores.vault,
    stores.editor,
    stores.graph,
    iwe_service,
  );

  const ai_service = new AiService(input.ports.ai, stores.vault);

  const bases_service = new BasesService(input.ports.bases, stores.bases);

  const task_service = new TaskService(
    input.ports.task,
    stores.task,
    stores.vault,
  );

  const canvas_service = new CanvasService(
    input.ports.canvas,
    stores.vault,
    stores.canvas,
    stores.op,
    now_ms,
  );

  const tag_service = new TagService(input.ports.tag, stores.tag, stores.vault);

  const metadata_service = new MetadataService(
    input.ports.metadata,
    stores.metadata,
    stores.vault,
  );

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
      split_view: stores.split_view,
      graph: stores.graph,
      bases: stores.bases,
      task: stores.task,
      parsed_note_cache: stores.parsed_note_cache,
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
  });

  register_plugin_actions(base_action_input, plugin_service);

  register_split_view_actions({
    ...base_action_input,
    split_view_store: stores.split_view,
    split_view_service,
    notes_port: input.ports.notes,
  });

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

  register_lint_actions({
    registry: action_registry,
    lint_service,
    lint_store: stores.lint,
    editor_store: stores.editor,
    editor_service,
    ui_store: stores.ui,
    diagnostics_store: stores.diagnostics,
  });

  register_iwe_actions({
    registry: action_registry,
    iwe_service,
    iwe_store: stores.iwe,
    editor_store: stores.editor,
    editor_service,
    ui_store: stores.ui,
  });

  register_toolchain_actions({
    registry: action_registry,
    toolchain_service,
  });

  register_query_actions(action_registry, query_service, stores.ui);

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
    split_view_store: stores.split_view,
    split_view_service,
    document_service,
    task_service,
    plugin_service,
    workspace_index_port: input.ports.index,
    lint_store: stores.lint,
    lint_service,
    iwe_store: stores.iwe,
    iwe_service,
    diagnostics_store: stores.diagnostics,
    metadata_store: stores.metadata,
    metadata_service,
    toolchain_service,
  });

  return {
    ports: input.ports,
    stores,
    services: base_action_input.services,
    action_registry,
    terminal_runtime: terminal_service,
    destroy: () => {
      cleanup_reactors();
      plugin_service.destroy();
      terminal_service.destroy();
      split_view_service.destroy();
      editor_service.unmount();
      void watcher_service.stop();
      void lint_service.stop();
      void iwe_service.stop();
      toolchain_service.dispose();
    },
  };
}
