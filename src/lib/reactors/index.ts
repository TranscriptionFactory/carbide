import { create_editor_sync_reactor } from "$lib/reactors/editor_sync.reactor.svelte";
import { create_editor_appearance_reactor } from "$lib/reactors/editor_appearance.reactor.svelte";
import { create_editor_width_reactor } from "$lib/reactors/editor_width.reactor.svelte";
import { create_theme_reactor } from "$lib/reactors/theme.reactor.svelte";
import {
  create_autosave_reactor,
  create_split_view_autosave_reactor,
} from "$lib/reactors/autosave.reactor.svelte";
import { create_op_toast_reactor } from "$lib/reactors/op_toast.reactor.svelte";
import { create_recent_notes_persist_reactor } from "$lib/reactors/recent_notes_persist.reactor.svelte";
import { create_starred_persist_reactor } from "$lib/reactors/starred_persist.reactor.svelte";
import { create_tab_dirty_sync_reactor } from "$lib/reactors/tab_dirty_sync.reactor.svelte";
import { create_tab_persist_reactor } from "$lib/reactors/tab_persist.reactor.svelte";
import { create_git_autocommit_reactor } from "$lib/reactors/git_autocommit.reactor.svelte";
import { create_git_auto_fetch_reactor } from "$lib/reactors/git_auto_fetch.reactor.svelte";
import { create_recent_commands_persist_reactor } from "$lib/reactors/recent_commands_persist.reactor.svelte";
import { create_find_in_file_reactor } from "$lib/reactors/find_in_file.reactor.svelte";
import { create_backlinks_sync_reactor } from "$lib/reactors/backlinks_sync.reactor.svelte";
import { create_local_links_sync_reactor } from "$lib/reactors/local_links_sync.reactor.svelte";
import { create_watcher_reactor } from "$lib/reactors/watcher.reactor.svelte";
import { create_window_title_reactor } from "$lib/reactors/window_title.reactor.svelte";
import { create_file_open_reactor } from "$lib/reactors/file_open.reactor.svelte";
import { create_conflict_toast_reactor } from "$lib/reactors/conflict_toast.reactor.svelte";
import { ConflictToastManager } from "$lib/reactors/conflict_toast";
import { create_split_view_persist_reactor } from "$lib/reactors/split_view_persist.reactor.svelte";
import { create_document_cache_reactor } from "$lib/reactors/document_cache.reactor.svelte";
import { create_terminal_reconcile_reactor } from "$lib/reactors/terminal_reconcile.reactor.svelte";
import { create_graph_refresh_reactor } from "$lib/reactors/graph_refresh.reactor.svelte";
import { create_bases_refresh_reactor } from "$lib/reactors/bases_refresh.reactor.svelte";
import { create_task_sync_reactor } from "$lib/reactors/task_sync.reactor.svelte";
import { create_menu_action_reactor } from "$lib/reactors/menu_action.reactor.svelte";
import { create_embedding_model_loaded_reactor } from "$lib/reactors/embedding_model_loaded.reactor.svelte";
import { create_suggested_links_refresh_reactor } from "$lib/reactors/suggested_links_refresh.reactor.svelte";
import { create_lint_reactor } from "$lib/reactors/lint.reactor.svelte";
import { create_marksman_lifecycle_reactor } from "$lib/reactors/marksman_lifecycle.reactor.svelte";
import { create_lsp_document_sync_reactor } from "$lib/reactors/lsp_document_sync.reactor.svelte";
import { create_code_lsp_document_sync_reactor } from "$lib/reactors/code_lsp_document_sync.reactor.svelte";
import { create_toolchain_lifecycle_reactor } from "$lib/reactors/toolchain_lifecycle.reactor.svelte";
import { create_diagnostics_active_file_reactor } from "$lib/reactors/diagnostics_active_file.reactor.svelte";
import { create_update_check_reactor } from "$lib/reactors/update_check.reactor.svelte";
import { create_metadata_sync_reactor } from "$lib/reactors/metadata_sync.reactor.svelte";
import { create_plugin_lifecycle_reactor } from "$lib/reactors/plugin_lifecycle.reactor.svelte";
import { create_plugin_note_indexed_reactor } from "$lib/reactors/plugin_note_indexed.reactor.svelte";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app";
import type { OpStore } from "$lib/app";
import type { NotesStore } from "$lib/features/note";
import type { VaultStore } from "$lib/features/vault";
import type { TabStore } from "$lib/features/tab";
import type { EditorService } from "$lib/features/editor";
import type { NoteService } from "$lib/features/note";
import type { VaultService } from "$lib/features/vault";
import type { SettingsService } from "$lib/features/settings";
import type { TabService } from "$lib/features/tab";
import type { GitStore } from "$lib/features/git";
import type { GitService } from "$lib/features/git";
import type { LinksService } from "$lib/features/links";
import type { SearchStore, WorkspaceIndexPort } from "$lib/features/search";
import type { LinksStore } from "$lib/features/links";
import type { WatcherService } from "$lib/features/watcher";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { SplitViewStore } from "$lib/features/split_view";
import type { SplitViewService } from "$lib/features/split_view";
import type { DocumentService } from "$lib/features/document";
import type { WorkspaceReconcile } from "$lib/app/orchestration/workspace_reconcile";
import type { TerminalService, TerminalStore } from "$lib/features/terminal";
import type { GraphService, GraphStore } from "$lib/features/graph";
import type { BasesService, BasesStore } from "$lib/features/bases";
import type { TaskService } from "$lib/features/task";
import type { LintStore, LintService } from "$lib/features/lint";
import type { MarksmanStore, MarksmanService } from "$lib/features/marksman";
import type { MetadataStore, MetadataService } from "$lib/features/metadata";
import type { DiagnosticsStore } from "$lib/features/diagnostics";
import type { PluginService } from "$lib/features/plugin";
import type { ToolchainService } from "$lib/features/toolchain";
import type { DocumentStore } from "$lib/features/document";
import type { CodeLspService } from "$lib/features/code_lsp";

export type ReactorContext = {
  editor_store: EditorStore;
  ui_store: UIStore;
  op_store: OpStore;
  notes_store: NotesStore;
  search_store: SearchStore;
  vault_store: VaultStore;
  tab_store: TabStore;
  git_store: GitStore;
  terminal_store: TerminalStore;
  links_store: LinksStore;
  graph_store: GraphStore;
  bases_store: BasesStore;
  editor_service: EditorService;
  note_service: NoteService;
  vault_service: VaultService;
  settings_service: SettingsService;
  tab_service: TabService;
  git_service: GitService;
  links_service: LinksService;
  terminal_service: TerminalService;
  graph_service: GraphService;
  bases_service: BasesService;
  watcher_service: WatcherService;
  action_registry: ActionRegistry;
  workspace_reconcile?: WorkspaceReconcile | undefined;
  split_view_store: SplitViewStore;
  split_view_service: SplitViewService;
  document_service: DocumentService;
  task_service: TaskService;
  plugin_service: PluginService;
  workspace_index_port: WorkspaceIndexPort;
  lint_store: LintStore;
  lint_service: LintService;
  marksman_store: MarksmanStore;
  marksman_service: MarksmanService;
  diagnostics_store: DiagnosticsStore;
  metadata_store: MetadataStore;
  metadata_service: MetadataService;
  toolchain_service: ToolchainService;
  document_store: DocumentStore;
  code_lsp_service: CodeLspService;
};

export function mount_reactors(context: ReactorContext): () => void {
  const conflict_toast_manager = new ConflictToastManager();

  const unmounts = [
    create_plugin_note_indexed_reactor(
      context.search_store,
      context.plugin_service,
    ),
    create_editor_sync_reactor(context.editor_store, context.editor_service),
    create_editor_appearance_reactor(context.ui_store),
    create_editor_width_reactor(context.ui_store),
    create_autosave_reactor(
      context.editor_store,
      context.ui_store,
      context.note_service,
      context.tab_service,
      "primary",
    ),
    create_split_view_autosave_reactor(
      () => context.split_view_service.get_secondary_editor_store(),
      context.ui_store,
      context.note_service,
      context.tab_service,
    ),
    create_theme_reactor(context.ui_store),
    create_op_toast_reactor(context.op_store),
    create_recent_notes_persist_reactor(
      context.notes_store,
      context.vault_store,
      context.vault_service,
    ),
    create_starred_persist_reactor(
      context.notes_store,
      context.vault_store,
      context.vault_service,
    ),
    create_tab_dirty_sync_reactor(
      context.editor_store,
      context.tab_store,
      context.tab_service,
    ),
    create_conflict_toast_reactor(
      context.editor_store,
      context.tab_store,
      context.tab_service,
      context.note_service,
      conflict_toast_manager,
    ),
    create_tab_persist_reactor(
      context.tab_store,
      context.vault_store,
      context.tab_service,
    ),
    create_git_autocommit_reactor(
      context.editor_store,
      context.git_store,
      context.ui_store,
      context.git_service,
    ),
    create_git_auto_fetch_reactor(
      context.git_store,
      context.ui_store,
      context.git_service,
    ),
    create_recent_commands_persist_reactor(
      context.ui_store,
      context.settings_service,
    ),
    create_find_in_file_reactor(context.ui_store, context.editor_service),
    create_local_links_sync_reactor(
      context.editor_store,
      context.ui_store,
      context.links_service,
    ),
    create_backlinks_sync_reactor(
      context.editor_store,
      context.ui_store,
      context.marksman_store,
      context.links_store,
      context.links_service,
    ),
    create_window_title_reactor(
      context.vault_store,
      context.tab_store,
      (title) => void getCurrentWindow().setTitle(title),
    ),
    create_file_open_reactor(
      (file_path) =>
        void context.action_registry.execute(
          ACTION_IDS.app_handle_file_open,
          file_path,
        ),
    ),
    create_watcher_reactor(
      context.vault_store,
      context.editor_store,
      context.tab_store,
      context.tab_service,
      context.note_service,
      context.watcher_service,
      context.action_registry,
      context.workspace_reconcile,
    ),
    create_split_view_persist_reactor(
      context.split_view_store,
      context.vault_store,
      context.split_view_service,
    ),
    create_document_cache_reactor(
      context.tab_store,
      context.ui_store,
      context.document_service,
    ),
    create_terminal_reconcile_reactor(
      context.terminal_store,
      context.ui_store,
      context.vault_store,
      context.terminal_service,
    ),
    create_graph_refresh_reactor(
      context.graph_store,
      context.vault_store,
      context.graph_service,
    ),
    create_bases_refresh_reactor(context.vault_store, context.bases_service),
    create_task_sync_reactor(
      context.vault_store,
      context.task_service,
      context.watcher_service,
    ),
    create_menu_action_reactor(
      (action_id) => void context.action_registry.execute(action_id),
    ),
    create_embedding_model_loaded_reactor(
      context.vault_store,
      context.workspace_index_port,
    ),
    create_suggested_links_refresh_reactor(
      context.editor_store,
      context.ui_store,
      context.links_service,
    ),
    create_lint_reactor(
      context.vault_store,
      context.editor_store,
      context.lint_store,
      context.lint_service,
      context.ui_store,
      context.note_service,
      context.editor_service,
    ),
    create_update_check_reactor(),
    // PHASE 5 DELETE: split_view_content_sync replaced by Yjs shared Y.XmlFragment
    create_metadata_sync_reactor(
      context.editor_store,
      context.ui_store,
      context.metadata_store,
      context.metadata_service,
    ),
    create_plugin_lifecycle_reactor(
      context.vault_store,
      context.plugin_service,
    ),
    create_marksman_lifecycle_reactor(
      context.vault_store,
      context.marksman_service,
    ),
    create_lsp_document_sync_reactor(context.editor_store, [
      {
        is_ready: () => context.marksman_store.status === "running",
        debounce_ms: 300,
        on_open: (path, content) => {
          void context.marksman_service
            .did_open(path, content)
            .then(() => context.marksman_service.document_symbols(path));
        },
        on_change: (path, content) =>
          void context.marksman_service.did_change(path, content),
        on_save: (path, content) =>
          void context.marksman_service.did_save(path, content),
        on_close: (path) =>
          context.diagnostics_store.clear_file("marksman", path),
      },
      {
        is_ready: () => context.lint_store.is_running,
        debounce_ms: 300,
        on_open: (path, content) =>
          void context.lint_service.notify_file_opened(path, content),
        on_change: (path, content) =>
          void context.lint_service.notify_file_changed(path, content),
        on_close: (path) => void context.lint_service.notify_file_closed(path),
      },
    ]),
    create_diagnostics_active_file_reactor(
      context.editor_store,
      context.diagnostics_store,
    ),
    create_code_lsp_document_sync_reactor(
      context.document_store,
      context.code_lsp_service,
      () => {
        const vault = context.vault_store.vault;
        if (!vault) return null;
        return { id: vault.id, path: vault.path };
      },
    ),
    create_toolchain_lifecycle_reactor(
      context.vault_store,
      context.toolchain_service,
    ),
  ];

  return () => {
    for (const unmount of unmounts) {
      unmount();
    }
    conflict_toast_manager.dismiss_all();
  };
}
