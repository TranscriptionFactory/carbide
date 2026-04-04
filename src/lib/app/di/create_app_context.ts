import type { Ports } from "$lib/app/di/app_ports";
import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { register_full_actions } from "$lib/app/full/register_full_actions";
import { register_lite_actions } from "$lib/app/lite/register_lite_actions";
import type { AppMountConfig } from "$lib/features/vault";
import { VaultService } from "$lib/features/vault";
import { NoteService } from "$lib/features/note";
import { FolderService } from "$lib/features/folder";
import { SettingsService } from "$lib/features/settings";
import {
  SearchService,
  build_command_context,
  get_commands_registry,
} from "$lib/features/search";
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
import type { AppTarget } from "$lib/features/window";
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
import { MarkdownLspService } from "$lib/features/markdown_lsp";
import { register_lsp_actions } from "$lib/features/lsp";
import { register_iwe_actions } from "$lib/features/markdown_lsp";
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
import { mount_full_reactors } from "$lib/app/full/mount_full_reactors";
import { mount_lite_reactors } from "$lib/app/lite/mount_lite_reactors";
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
  app_target?: AppTarget;
}) {
  const now_ms = input.now_ms ?? (() => Date.now());
  const app_target = input.app_target ?? "full";
  const is_lite = app_target === "lite";
  const stores = create_app_stores(app_target);
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
    is_lite ? undefined : stores.plugin!,
    () =>
      build_command_context(
        is_lite
          ? {
              editor: stores.editor,
              git: stores.git,
            }
          : {
              editor: stores.editor,
              git: stores.git,
              ai: stores.ai!,
            },
      ),
    get_commands_registry(app_target),
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
    on_markdown_lsp_hover: async (file_path, line, character) => {
      const vault_id = stores.vault.vault?.id;
      if (!vault_id || stores.markdown_lsp.status !== "running") return null;
      try {
        return await input.ports.markdown_lsp.hover(
          vault_id,
          file_path,
          line,
          character,
        );
      } catch {
        return null;
      }
    },
    on_markdown_lsp_definition: async (file_path, line, character) => {
      const vault_id = stores.vault.vault?.id;
      if (!vault_id || stores.markdown_lsp.status !== "running") return [];
      try {
        return await input.ports.markdown_lsp.definition(
          vault_id,
          file_path,
          line,
          character,
        );
      } catch {
        return [];
      }
    },
    on_markdown_lsp_definition_navigate: (uri: string) => {
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
    get_markdown_lsp_completion_trigger_characters: () =>
      stores.markdown_lsp.completion_trigger_characters,
    on_markdown_lsp_completion: async (file_path, line, character) => {
      const vault_id = stores.vault.vault?.id;
      if (!vault_id || stores.markdown_lsp.status !== "running") return [];
      try {
        return await input.ports.markdown_lsp.completion(
          vault_id,
          file_path,
          line,
          character,
        );
      } catch {
        return [];
      }
    },
    on_markdown_lsp_inlay_hints: async (file_path) => {
      const vault_id = stores.vault.vault?.id;
      if (!vault_id || stores.markdown_lsp.status !== "running") return [];
      try {
        return await input.ports.markdown_lsp.inlay_hints(vault_id, file_path);
      } catch {
        return [];
      }
    },
    on_markdown_lsp_code_actions: async (
      file_path,
      start_line,
      start_character,
      end_line,
      end_character,
    ) => {
      const vault_id = stores.vault.vault?.id;
      if (!vault_id || stores.markdown_lsp.status !== "running") return [];
      try {
        const actions = await input.ports.markdown_lsp.code_actions(
          vault_id,
          file_path,
          start_line,
          start_character,
          end_line,
          end_character,
        );
        stores.markdown_lsp.set_code_actions(actions);
        return actions;
      } catch {
        stores.markdown_lsp.set_code_actions([]);
        return [];
      }
    },
    on_markdown_lsp_code_action_resolve: (action) => {
      void action_registry.execute(
        ACTION_IDS.markdown_lsp_code_action_resolve,
        action,
      );
    },
  };

  if (!is_lite) {
    editor_callbacks.on_lsp_code_actions = async (
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
      if (vault_id && stores.markdown_lsp.status === "running") {
        try {
          const md_lsp_actions = await input.ports.markdown_lsp.code_actions(
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
              : "Markdown LSP";
          all_actions.push(...md_lsp_actions.map((a) => ({ ...a, source })));
        } catch {
          /* ignore */
        }
      }

      stores.lsp.set_code_actions(all_actions);
      return all_actions;
    };
    editor_callbacks.on_lsp_code_action_resolve = (action) => {
      void action_registry.execute(ACTION_IDS.lsp_code_action_resolve, action);
    };
  }

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
    is_lite ? undefined : stores.reference!,
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
    input.ports.markdown_lsp,
    stores.markdown_lsp,
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

  const markdown_lsp_service = new MarkdownLspService(
    input.ports.markdown_lsp,
    stores.markdown_lsp,
    stores.vault,
    stores.diagnostics,
  );

  const full_runtime = is_lite
    ? null
    : (() => {
        const plugin_settings_service = new PluginSettingsService(
          stores.plugin_settings!,
          stores.vault,
          input.ports.plugin_settings,
        );

        const plugin_service = new PluginService(
          stores.plugin!,
          stores.vault,
          input.ports.plugin,
        );

        plugin_service.set_settings_service(
          plugin_settings_service,
          stores.plugin_settings!,
        );

        plugin_service.on_plugin_cleanup((plugin_id) => {
          stores.diagnostics.clear_source(
            `plugin:${plugin_id}` as DiagnosticSource,
          );
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

        const code_lsp_service = new CodeLspService(
          input.ports.code_lsp,
          stores.code_lsp!,
          stores.diagnostics,
        );
        code_lsp_service.start();

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
          stores.canvas!,
          stores.op,
          now_ms,
        );
        const tag_service = new TagService(
          input.ports.tag,
          stores.tag!,
          stores.vault,
        );
        const metadata_service = new MetadataService(
          stores.metadata!,
          stores.editor,
        );
        const toolchain_service = new ToolchainService(
          input.ports.toolchain,
          stores.toolchain!,
        );
        const query_service = new QueryService(
          {
            search: input.ports.search,
            index: input.ports.index,
            tags: input.ports.tag,
            bases: input.ports.bases,
          },
          stores.query!,
          stores.vault,
          input.ports.saved_query,
          stores.op,
        );
        const reference_service = new ReferenceService(
          input.ports.reference_storage,
          stores.reference!,
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

        return {
          plugin_settings_service,
          plugin_service,
          code_lsp_service,
          graph_service,
          ai_service,
          bases_service,
          task_service,
          canvas_service,
          tag_service,
          metadata_service,
          toolchain_service,
          query_service,
          reference_service,
        };
      })();

  const app_services = {
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
    bases: full_runtime?.bases_service as BasesService,
    task: full_runtime?.task_service as TaskService,
    plugin: full_runtime?.plugin_service as PluginService,
    plugin_settings:
      full_runtime?.plugin_settings_service as PluginSettingsService,
    reference: full_runtime?.reference_service as ReferenceService,
  };

  const base_action_input = {
    app_target,
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
      ...(is_lite ? {} : { reference: stores.reference }),
    },
    services: app_services,
    default_mount_config: input.default_mount_config,
  };

  if (is_lite) {
    register_lite_actions(base_action_input);
  } else {
    register_full_actions(base_action_input);
  }

  register_links_actions(action_registry, editor_service);

  if (full_runtime) {
    full_runtime.plugin_service.initialize_rpc({
      services: {
        note: {
          async read_note(note_path) {
            const vault = stores.vault.vault;
            if (!vault) throw new Error("No active vault");
            return input.ports.notes.read_note(
              vault.id,
              as_note_path(note_path),
            );
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
        plugin: full_runtime.plugin_service,
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
          return input.ports.search.get_note_stats(
            require_vault().id,
            note_path,
          );
        },
      },
    });
  }

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
    app_target,
    window_port: input.ports.window,
  });

  if (full_runtime) {
    register_plugin_actions(base_action_input, full_runtime.plugin_service);

    register_ai_actions({
      ...base_action_input,
      ai_store: stores.ai!,
      ai_service: full_runtime.ai_service,
    });

    register_graph_actions({
      ...base_action_input,
      graph_store: stores.graph,
      graph_service: full_runtime.graph_service,
    });

    register_canvas_actions({
      ...base_action_input,
      canvas_service: full_runtime.canvas_service,
    });

    register_tag_actions(
      action_registry,
      full_runtime.tag_service,
      stores.tag!,
      stores.ui,
    );
    register_metadata_actions(
      action_registry,
      full_runtime.metadata_service,
      stores.metadata!,
      stores.ui,
    );

    register_reference_actions({
      registry: action_registry,
      reference_service: full_runtime.reference_service,
      reference_store: stores.reference!,
      editor_service,
      ui_store: stores.ui,
    });
  }

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
    id: ACTION_IDS.markdown_lsp_code_action_resolve,
    label: "Markdown LSP: Resolve Code Action",
    execute: async (action) => {
      const result = await markdown_lsp_service.code_action_resolve(
        (action as { raw_json: string }).raw_json,
      );
      if (result) {
        await apply_workspace_edit_result(result, workspace_edit_deps);
      }
    },
  });

  if (full_runtime) {
    register_lsp_actions({
      registry: action_registry,
      lsp_store: stores.lsp,
      editor_store: stores.editor,
      editor_service,
      note_service,
      diagnostics_store: stores.diagnostics,
      ui_store: stores.ui,
      op_store: stores.op,
      markdown_lsp_service,
      workspace_edit_deps,
    });

    register_iwe_actions({
      registry: action_registry,
      editor_store: stores.editor,
      markdown_lsp_store: stores.markdown_lsp,
      markdown_lsp_service,
      ui_store: stores.ui,
      workspace_edit_deps,
      command_sink: {
        register: (cmd) => {
          stores.plugin!.register_command(cmd);
        },
        unregister: (id) => {
          stores.plugin!.unregister_command(id);
        },
      },
    });

    register_toolchain_actions({
      registry: action_registry,
      toolchain_service: full_runtime.toolchain_service,
    });

    register_bases_actions(
      action_registry,
      full_runtime.bases_service,
      stores.bases,
      stores.vault,
      stores.ui,
    );

    register_task_actions(
      action_registry,
      full_runtime.task_service,
      stores.task,
      stores.ui,
    );

    register_query_actions(
      action_registry,
      full_runtime.query_service,
      stores.ui,
    );
  }

  register_vim_nav_actions({
    registry: action_registry,
    ui_store: stores.ui,
    notes_store: stores.notes,
    outline_store: stores.outline,
    vim_nav_store: stores.vim_nav,
  });

  const core_reactor_context = {
    editor_store: stores.editor,
    ui_store: stores.ui,
    op_store: stores.op,
    notes_store: stores.notes,
    vault_store: stores.vault,
    tab_store: stores.tab,
    terminal_store: stores.terminal,
    links_store: stores.links,
    editor_service,
    note_service,
    vault_service,
    settings_service,
    tab_service,
    links_service,
    watcher_service,
    action_registry,
    workspace_reconcile,
    document_service,
    lint_store: stores.lint,
    lint_service,
    markdown_lsp_store: stores.markdown_lsp,
    diagnostics_store: stores.diagnostics,
    theme_service,
    terminal_service,
  };

  const cleanup_reactors = full_runtime
    ? mount_full_reactors({
        ...core_reactor_context,
        search_store: stores.search,
        git_store: stores.git,
        graph_store: stores.graph,
        bases_store: stores.bases,
        git_service,
        graph_service: full_runtime.graph_service,
        bases_service: full_runtime.bases_service,
        task_service: full_runtime.task_service,
        plugin_service: full_runtime.plugin_service,
        workspace_index_port: input.ports.index,
        markdown_lsp_service,
        metadata_store: stores.metadata!,
        metadata_service: full_runtime.metadata_service,
        toolchain_service: full_runtime.toolchain_service,
        document_store: stores.document,
        code_lsp_service: full_runtime.code_lsp_service,
        reference_service: full_runtime.reference_service,
        reference_store: stores.reference!,
      })
    : mount_lite_reactors(core_reactor_context);

  return {
    app_target,
    ports: input.ports,
    stores,
    services: app_services,
    action_registry,
    secondary_editor_manager,
    terminal_runtime: terminal_service,
    destroy: () => {
      cleanup_reactors();
      full_runtime?.plugin_service.destroy();
      terminal_service.destroy();
      secondary_editor_manager.destroy();
      editor_service.unmount();
      void watcher_service.stop();
      void lint_service.stop();
      void markdown_lsp_service.stop();
      full_runtime?.code_lsp_service.stop();
      full_runtime?.toolchain_service.dispose();
    },
  };
}
