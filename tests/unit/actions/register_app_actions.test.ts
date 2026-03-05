import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_app_actions } from "$lib/app/orchestration/app_actions";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { OutlineStore } from "$lib/features/outline";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";
import { DEFAULT_HOTKEYS } from "$lib/features/hotkey";
import {
  as_markdown_text,
  as_note_path,
  as_vault_id,
} from "$lib/shared/types/ids";
import type { OpenNoteState } from "$lib/shared/types/editor";
import type { Vault } from "$lib/shared/types/vault";
import { toast } from "svelte-sonner";

vi.mock("svelte-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn().mockReturnValue("toast-id"),
    dismiss: vi.fn(),
  },
}));

type HarnessOptions = {
  reset_app_state?: boolean;
};

function create_app_note(path = "notes/a.md"): OpenNoteState {
  return {
    meta: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: "a.md",
      title: "a",
      mtime_ms: 0,
      size_bytes: 0,
    },
    markdown: as_markdown_text("# A"),
    buffer_id: path,
    is_dirty: false,
  };
}

function create_harness(options: HarnessOptions = {}) {
  const registry = new ActionRegistry();
  const stores = {
    ui: new UIStore(),
    vault: new VaultStore(),
    notes: new NotesStore(),
    editor: new EditorStore(),
    op: new OpStore(),
    search: new SearchStore(),
    tab: new TabStore(),
    git: new GitStore(),
    outline: new OutlineStore(),
  };

  const services = {
    vault: {
      initialize: vi.fn().mockResolvedValue({
        status: "ready",
        has_vault: false,
        editor_settings: null,
      }),
    },
    settings: {
      load_recent_command_ids: vi.fn().mockResolvedValue(["settings.open"]),
    },
    hotkey: {
      load_hotkey_overrides: vi.fn().mockResolvedValue([]),
      merge_config: vi.fn().mockReturnValue({ bindings: DEFAULT_HOTKEYS }),
    },
    theme: {
      load_themes: vi.fn().mockResolvedValue({
        user_themes: [],
        active_theme_id: "theme-light",
      }),
    },
    editor: {
      mount: vi.fn().mockResolvedValue(undefined),
      unmount: vi.fn(),
    },
  };

  const execute_folder_refresh_tree = vi.fn().mockResolvedValue(undefined);
  const execute_git_check_repo = vi.fn().mockResolvedValue(undefined);
  const execute_open_vault_dashboard = vi.fn().mockResolvedValue(undefined);
  const execute_note_open = vi.fn().mockResolvedValue(undefined);
  const execute_vault_select = vi.fn().mockResolvedValue(undefined);

  register_app_actions({
    registry,
    stores,
    services: services as never,
    default_mount_config: {
      reset_app_state: options.reset_app_state ?? false,
      bootstrap_default_vault_path: null,
    },
  });

  registry.register({
    id: ACTION_IDS.folder_refresh_tree,
    label: "Refresh Folder Tree",
    execute: execute_folder_refresh_tree,
  });

  registry.register({
    id: ACTION_IDS.git_check_repo,
    label: "Check Git Repo",
    execute: execute_git_check_repo,
  });

  registry.register({
    id: ACTION_IDS.ui_open_vault_dashboard,
    label: "Open Vault Dashboard",
    execute: execute_open_vault_dashboard,
  });

  registry.register({
    id: ACTION_IDS.note_open,
    label: "Open Note",
    execute: execute_note_open,
  });

  registry.register({
    id: ACTION_IDS.vault_select,
    label: "Select Vault",
    execute: execute_vault_select,
  });

  return {
    registry,
    stores,
    services,
    execute_folder_refresh_tree,
    execute_git_check_repo,
    execute_open_vault_dashboard,
    execute_note_open,
    execute_vault_select,
  };
}

describe("register_app_actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes app state and loads vault UI when vault exists", async () => {
    const {
      registry,
      stores,
      services,
      execute_folder_refresh_tree,
      execute_git_check_repo,
      execute_open_vault_dashboard,
    } = create_harness();

    services.vault.initialize.mockResolvedValue({
      status: "ready",
      has_vault: true,
      editor_settings: {
        ...stores.ui.editor_settings,
        show_vault_dashboard_on_open: true,
      },
    });

    await registry.execute(ACTION_IDS.app_mounted);

    expect(stores.ui.startup).toEqual({ status: "idle", error: null });
    expect(execute_folder_refresh_tree).toHaveBeenCalledTimes(1);
    expect(execute_git_check_repo).toHaveBeenCalledTimes(1);
    expect(execute_open_vault_dashboard).toHaveBeenCalledTimes(1);
    expect(services.hotkey.merge_config).toHaveBeenCalledWith(
      DEFAULT_HOTKEYS,
      [],
    );
  });

  it("sets startup error state when vault initialization fails", async () => {
    const {
      registry,
      stores,
      services,
      execute_folder_refresh_tree,
      execute_git_check_repo,
      execute_open_vault_dashboard,
    } = create_harness();

    services.vault.initialize.mockResolvedValue({
      status: "error",
      error: "startup failed",
    });

    await registry.execute(ACTION_IDS.app_mounted);

    expect(stores.ui.startup).toEqual({
      status: "error",
      error: "startup failed",
    });
    expect(execute_folder_refresh_tree).not.toHaveBeenCalled();
    expect(execute_git_check_repo).not.toHaveBeenCalled();
    expect(execute_open_vault_dashboard).not.toHaveBeenCalled();
  });

  it("resets UI state on mount when reset_app_state is true", async () => {
    const { registry, stores } = create_harness({ reset_app_state: true });
    const reset_for_new_vault_spy = vi.spyOn(stores.ui, "reset_for_new_vault");

    await registry.execute(ACTION_IDS.app_mounted);

    expect(reset_for_new_vault_spy).toHaveBeenCalledTimes(1);
    expect(stores.ui.editor_settings).toEqual({ ...DEFAULT_EDITOR_SETTINGS });
    expect(stores.ui.startup).toEqual({ status: "idle", error: null });
  });

  it("mounts and unmounts editor via editor service", async () => {
    const { registry, services } = create_harness();
    const note = create_app_note();
    const root = {} as HTMLDivElement;

    await registry.execute(ACTION_IDS.app_editor_mount, root, note);

    expect(services.editor.mount).toHaveBeenCalledWith({ root, note });

    await registry.execute(ACTION_IDS.app_editor_unmount);

    expect(services.editor.unmount).toHaveBeenCalledTimes(1);
  });

  it("shows desktop-only info toast when checking updates outside tauri", async () => {
    const { registry } = create_harness();

    await registry.execute(ACTION_IDS.app_check_for_updates);

    expect(toast.info).toHaveBeenCalledWith(
      "Updates are only available in the desktop app",
    );
  });

  describe("app_handle_file_open", () => {
    function create_vault(id: string, path: string): Vault {
      return {
        id: as_vault_id(id),
        name: id,
        path: path,
        note_count: 0,
      } as Vault;
    }

    it("opens note in current vault when file resolves to active vault", async () => {
      const { registry, stores, services, execute_note_open } =
        create_harness();
      stores.vault.set_vault(create_vault("v1", "/vaults/v1"));

      services.vault.resolve_file_to_vault = vi.fn().mockResolvedValue({
        vault_id: "v1",
        vault_path: "/vaults/v1",
        relative_path: "notes/hello.md",
      });

      await registry.execute(
        ACTION_IDS.app_handle_file_open,
        "/vaults/v1/notes/hello.md",
      );

      expect(execute_note_open).toHaveBeenCalledWith({
        note_path: as_note_path("notes/hello.md"),
        cleanup_if_missing: false,
      });
    });

    it("opens parent dir as vault when no vault is active and file not in known vault", async () => {
      const { registry, services, execute_note_open } = create_harness();

      services.vault.resolve_file_to_vault = vi.fn().mockResolvedValue(null);
      services.vault.change_vault_by_path = vi.fn().mockResolvedValue({
        status: "ok",
      });

      await registry.execute(
        ACTION_IDS.app_handle_file_open,
        "/Users/foo/docs/readme.md",
      );

      expect(services.vault.change_vault_by_path).toHaveBeenCalledWith(
        "/Users/foo/docs",
      );
      expect(execute_note_open).toHaveBeenCalledWith({
        note_path: as_note_path("readme.md"),
        cleanup_if_missing: false,
      });
    });

    it("toasts error when file open fails", async () => {
      const { registry, services } = create_harness();

      services.vault.resolve_file_to_vault = vi
        .fn()
        .mockRejectedValue(new Error("boom"));

      await registry.execute(ACTION_IDS.app_handle_file_open, "/some/file.md");

      expect(toast.error).toHaveBeenCalledWith("Failed to open file");
    });
  });
});
