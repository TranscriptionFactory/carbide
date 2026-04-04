import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_core_actions } from "$lib/app/action_registry/register_core_actions";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { LITE_APP_SURFACE } from "$lib/app/orchestration/app_surface";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { OutlineStore } from "$lib/features/outline";
import { ParsedNoteCache } from "$lib/features/note/state/parsed_note_cache.svelte";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";

function create_lite_input(): ActionRegistrationInput {
  const registry = new ActionRegistry();
  const stores = {
    ui: new UIStore(LITE_APP_SURFACE),
    vault: new VaultStore(),
    notes: new NotesStore(),
    editor: new EditorStore(),
    op: new OpStore(),
    search: new SearchStore(),
    tab: new TabStore(),
    git: new GitStore(),
    outline: new OutlineStore(),
    parsed_note_cache: new ParsedNoteCache(),
  };
  const services = {
    vault: {
      refresh_dashboard_stats: vi.fn().mockResolvedValue({ status: "skipped" }),
      open: vi.fn(),
      create: vi.fn(),
      close: vi.fn(),
      list: vi.fn(),
    },
    note: {
      create: vi.fn(),
      read: vi.fn(),
      write: vi.fn(),
      delete: vi.fn(),
      rename: vi.fn(),
      duplicate: vi.fn(),
      exists: vi.fn(),
      copy_markdown: vi.fn(),
      copy_html: vi.fn(),
      toggle_star: vi.fn(),
      insert_image: vi.fn(),
    },
    folder: {
      create: vi.fn(),
      delete: vi.fn(),
      rename: vi.fn(),
      toggle: vi.fn(),
      load_children: vi.fn(),
      move: vi.fn(),
      toggle_star: vi.fn(),
    },
    settings: {
      load: vi.fn().mockResolvedValue({}),
      save: vi.fn(),
    },
    search: {
      search_vault: vi.fn().mockResolvedValue([]),
      search_all_vaults: vi.fn().mockResolvedValue([]),
    },
    editor: {
      mount: vi.fn(),
      unmount: vi.fn(),
      close_buffer: vi.fn(),
    },
    clipboard: {
      copy: vi.fn(),
      paste: vi.fn(),
    },
    shell: {
      open_url: vi.fn(),
      open_path: vi.fn(),
      reveal_in_file_manager: vi.fn(),
    },
    tab: {
      open: vi.fn(),
      close: vi.fn(),
    },
    git: {
      check_repo: vi.fn(),
      init: vi.fn(),
      commit_all: vi.fn(),
      status: vi.fn(),
      log: vi.fn(),
      push: vi.fn(),
      fetch: vi.fn(),
      pull: vi.fn(),
      add_remote: vi.fn(),
      restore_version: vi.fn(),
    },
    hotkey: {
      load: vi.fn(),
      save: vi.fn(),
      reset: vi.fn(),
      set_binding: vi.fn(),
      clear_binding: vi.fn(),
    },
    theme: {
      load: vi.fn(),
      switch: vi.fn(),
      create: vi.fn(),
      duplicate: vi.fn(),
      rename: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      save: vi.fn(),
      revert: vi.fn(),
    },
    reference: {},
  } as never;

  return {
    registry,
    app_target: "lite",
    stores,
    services,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
  };
}

describe("lite core action smoke", () => {
  it("registers all core actions without error", () => {
    const input = create_lite_input();

    expect(() => register_core_actions(input)).not.toThrow();

    const registered = new Set(
      input.registry.get_all().map((action) => action.id),
    );
    expect(registered.size).toBeGreaterThan(0);

    expect(registered.has(ACTION_IDS.ui_toggle_context_rail)).toBe(true);
    expect(registered.has(ACTION_IDS.ui_toggle_outline_panel)).toBe(true);
    expect(registered.has(ACTION_IDS.ui_toggle_zen_mode)).toBe(true);
    expect(registered.has(ACTION_IDS.ui_toggle_sidebar)).toBe(true);
    expect(registered.has(ACTION_IDS.note_create)).toBe(true);
    expect(registered.has(ACTION_IDS.note_open)).toBe(true);
    expect(registered.has(ACTION_IDS.tab_close)).toBe(true);
    expect(registered.has(ACTION_IDS.settings_open)).toBe(true);
    expect(registered.has(ACTION_IDS.omnibar_toggle)).toBe(true);
    expect(registered.has(ACTION_IDS.help_open)).toBe(true);
  });

  it("does not register full-only action IDs", () => {
    const input = create_lite_input();
    register_core_actions(input);

    const registered = new Set(
      input.registry.get_all().map((action) => action.id),
    );

    expect(registered.has(ACTION_IDS.graph_toggle_panel)).toBe(false);
    expect(registered.has(ACTION_IDS.graph_close)).toBe(false);
    expect(registered.has(ACTION_IDS.graph_open_as_tab)).toBe(false);
    expect(registered.has(ACTION_IDS.query_open)).toBe(false);
    expect(registered.has(ACTION_IDS.query_execute)).toBe(false);
    expect(registered.has(ACTION_IDS.ui_open_vault_dashboard)).toBe(false);
    expect(registered.has(ACTION_IDS.ui_close_vault_dashboard)).toBe(false);
    expect(registered.has(ACTION_IDS.ui_toggle_tasks_panel)).toBe(false);
    expect(registered.has(ACTION_IDS.ui_show_tasks_list)).toBe(false);
    expect(registered.has(ACTION_IDS.ui_show_tasks_kanban)).toBe(false);
    expect(registered.has(ACTION_IDS.ui_show_tasks_schedule)).toBe(false);
    expect(registered.has(ACTION_IDS.ui_quick_capture)).toBe(false);
    expect(registered.has(ACTION_IDS.bases_toggle_panel)).toBe(false);
    expect(registered.has(ACTION_IDS.task_toggle_panel)).toBe(false);
  });
});
