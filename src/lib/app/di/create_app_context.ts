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
import { LinkRepairService, LinksService } from "$lib/features/links";
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
import {
  GraphService,
  register_graph_actions,
} from "$lib/features/graph";
import { register_window_actions } from "$lib/features/window";
import { AiService, register_ai_actions } from "$lib/features/ai";
import { BasesService } from "$lib/features/bases";
import { WatcherService } from "$lib/features/watcher";
import { TaskService } from "$lib/features/task";
import { mount_reactors } from "$lib/reactors";
import { create_workspace_reconcile } from "$lib/app/orchestration/workspace_reconcile";

export type AppContext = ReturnType<typeof create_app_context>;

export function create_app_context(input: {
  ports: Ports;
  now_ms?: () => number;
  default_mount_config: AppMountConfig;
}) {
  const now_ms = input.now_ms ?? (() => Date.now());
  const stores = create_app_stores();
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
  };

  const editor_service = new EditorService(
    input.ports.editor,
    stores.vault,
    stores.editor,
    stores.op,
    editor_callbacks,
    search_service,
    stores.outline,
  );

  const settings_service = new SettingsService(
    input.ports.vault_settings,
    input.ports.settings,
    stores.vault,
    stores.op,
    now_ms,
  );

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
  );

  const watcher_service = new WatcherService(input.ports.watcher);

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

  const graph_service = new GraphService(
    input.ports.graph,
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
    },
    default_mount_config: input.default_mount_config,
  };

  register_actions(base_action_input);

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
  });

  return {
    ports: input.ports,
    stores,
    services: base_action_input.services,
    action_registry,
    terminal_runtime: terminal_service,
    destroy: () => {
      cleanup_reactors();
      terminal_service.destroy();
      split_view_service.destroy();
      editor_service.unmount();
      void watcher_service.stop();
    },
  };
}
