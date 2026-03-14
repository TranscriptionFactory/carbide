import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { WorkspaceReconcile } from "$lib/app/orchestration/workspace_reconcile";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { register_settings_actions } from "$lib/features/settings";
import { as_vault_id, as_vault_path } from "$lib/shared/types/ids";
import {
  DEFAULT_EDITOR_SETTINGS,
  type EditorSettings,
} from "$lib/shared/types/editor_settings";

function create_harness(
  options: { workspace_reconcile?: WorkspaceReconcile } = {},
) {
  const registry = new ActionRegistry();
  const stores = {
    ui: new UIStore(),
    op: new OpStore(),
    git: new GitStore(),
    vault: new VaultStore(),
  };

  const services = {
    settings: {
      load_settings: vi.fn().mockResolvedValue({
        status: "success",
        settings: { ...DEFAULT_EDITOR_SETTINGS },
      }),
      save_settings: vi.fn().mockResolvedValue({ status: "success" }),
      reset_load_operation: vi.fn(),
      reset_save_operation: vi.fn(),
    },
    note: {
      list_all_folders: vi.fn().mockResolvedValue([]),
    },
    hotkey: {
      save_hotkey_overrides: vi.fn().mockResolvedValue(undefined),
      merge_config: vi.fn(() => ({ bindings: [] })),
    },
    git: {
      set_remote_url: vi.fn().mockResolvedValue({ success: true }),
    },
  };

  register_settings_actions({
    registry,
    workspace_reconcile: options.workspace_reconcile,
    stores,
    services: services as never,
    default_mount_config: {
      reset_app_state: false,
      bootstrap_default_vault_path: null,
    },
  } as never);

  for (const id of [
    ACTION_IDS.theme_revert,
    ACTION_IDS.theme_save,
    ACTION_IDS.folder_refresh_tree,
    ACTION_IDS.vault_sync_index,
  ]) {
    registry.register({
      id,
      label: id,
      execute: vi.fn(),
    });
  }

  stores.ui.editor_settings = { ...DEFAULT_EDITOR_SETTINGS };
  stores.ui.settings_dialog = {
    ...stores.ui.settings_dialog,
    open: true,
    current_settings: { ...DEFAULT_EDITOR_SETTINGS },
    persisted_settings: { ...DEFAULT_EDITOR_SETTINGS },
    hotkey_draft_overrides: [],
    hotkey_draft_config: { bindings: [] },
  };

  return { registry, stores, services };
}

describe("register_settings_actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps settings drafts local until save", async () => {
    const { registry, stores } = create_harness();
    const draft: EditorSettings = {
      ...DEFAULT_EDITOR_SETTINGS,
      autosave_delay_ms: 3500,
    };

    await registry.execute(ACTION_IDS.settings_update, draft);

    expect(stores.ui.settings_dialog.current_settings.autosave_delay_ms).toBe(
      3500,
    );
    expect(stores.ui.editor_settings.autosave_delay_ms).toBe(
      DEFAULT_EDITOR_SETTINGS.autosave_delay_ms,
    );
    expect(stores.ui.settings_dialog.has_unsaved_changes).toBe(true);
  });

  it("clears the draft dirty flag when settings match persisted values", async () => {
    const { registry, stores } = create_harness();

    stores.ui.settings_dialog.has_unsaved_changes = true;

    await registry.execute(ACTION_IDS.settings_update, {
      ...DEFAULT_EDITOR_SETTINGS,
    });

    expect(stores.ui.settings_dialog.has_unsaved_changes).toBe(false);
  });

  it("tracks appearance setting changes in the dirty state", async () => {
    const { registry, stores } = create_harness();

    await registry.execute(ACTION_IDS.settings_update, {
      ...DEFAULT_EDITOR_SETTINGS,
      editor_link_underline_style: "wavy",
    });

    expect(stores.ui.settings_dialog.has_unsaved_changes).toBe(true);

    await registry.execute(ACTION_IDS.settings_update, {
      ...DEFAULT_EDITOR_SETTINGS,
    });

    expect(stores.ui.settings_dialog.has_unsaved_changes).toBe(false);
  });

  it("applies draft settings to live settings on save", async () => {
    const { registry, stores, services } = create_harness();
    const draft: EditorSettings = {
      ...DEFAULT_EDITOR_SETTINGS,
      terminal_font_size_px: 16,
    };

    await registry.execute(ACTION_IDS.settings_update, draft);
    await registry.execute(ACTION_IDS.settings_save);

    expect(services.settings.save_settings).toHaveBeenCalledWith(draft);
    expect(stores.ui.editor_settings.terminal_font_size_px).toBe(16);
    expect(
      stores.ui.settings_dialog.persisted_settings.terminal_font_size_px,
    ).toBe(16);
    expect(stores.ui.settings_dialog.has_unsaved_changes).toBe(false);
  });

  it("loads all folder paths when settings dialog opens", async () => {
    const { registry, stores, services } = create_harness();

    stores.vault.set_vault({
      id: as_vault_id("vault-a"),
      name: "Vault A",
      path: as_vault_path("/vault/a"),
      created_at: 0,
      mode: "vault",
    });

    services.note.list_all_folders.mockResolvedValue([
      "docs",
      "docs/nested",
      "papers",
      "papers/raw",
    ]);

    await registry.execute(ACTION_IDS.settings_open, "vault");
    await vi.waitFor(() => {
      expect(stores.ui.settings_dialog.all_folder_paths).toEqual([
        "docs",
        "docs/nested",
        "papers",
        "papers/raw",
      ]);
    });
  });

  it("uses workspace_reconcile for ignored folder saves when available", async () => {
    const workspace_reconcile = vi.fn().mockResolvedValue(undefined);
    const { registry, stores } = create_harness({ workspace_reconcile });
    const draft: EditorSettings = {
      ...DEFAULT_EDITOR_SETTINGS,
      ignored_folders: ["build"],
    };

    stores.vault.set_vault({
      id: as_vault_id("vault-a"),
      name: "Vault A",
      path: as_vault_path("/vault/a"),
      created_at: 0,
      mode: "vault",
    });

    await registry.execute(ACTION_IDS.settings_update, draft);
    await registry.execute(ACTION_IDS.settings_save);

    expect(workspace_reconcile).toHaveBeenCalledWith({
      refresh_tree: true,
      sync_index: true,
    });
  });
});
