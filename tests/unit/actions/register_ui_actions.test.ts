import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_ui_actions } from "$lib/app/orchestration/ui_actions";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { LITE_APP_SURFACE } from "$lib/app/orchestration/app_surface";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { BasesStore } from "$lib/features/bases/state/bases_store.svelte";
import { TaskStore } from "$lib/features/task/state/task_store.svelte";
import { GraphStore } from "$lib/features/graph";
import { OutlineStore } from "$lib/features/outline";
import { ParsedNoteCache } from "$lib/features/note/state/parsed_note_cache.svelte";
import { ReferenceStore } from "$lib/features/reference/state/reference_store.svelte";

function create_ui_stores() {
  return {
    ui: new UIStore(__CARBIDE_LITE__ ? LITE_APP_SURFACE : undefined),
    vault: new VaultStore(),
    notes: new NotesStore(),
    editor: new EditorStore(),
    op: new OpStore(),
    search: new SearchStore(),
    tab: new TabStore(),
    git: new GitStore(),
    bases: new BasesStore(),
    task: new TaskStore(),
    graph: new GraphStore(),
    outline: new OutlineStore(),
    parsed_note_cache: new ParsedNoteCache(),
    reference: new ReferenceStore(),
  };
}

function register_actions_for_test(
  registry: ActionRegistry,
  stores: ReturnType<typeof create_ui_stores>,
) {
  let refresh_called = 0;

  register_ui_actions({
    registry,
    app_target: __CARBIDE_LITE__ ? "lite" : "full",
    stores,
    services: {
      reference: {},
      vault: {
        refresh_dashboard_stats: async () => {
          refresh_called += 1;
          return await Promise.resolve({ status: "skipped" as const });
        },
      },
      shell: {
        open_url: async () => {},
        open_path: async () => {},
        reveal_in_file_manager: async () => {},
      },
    } as never,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
  });

  return {
    refresh_called: () => refresh_called,
  };
}

describe("register_ui_actions", () => {
  it("opens and closes vault dashboard", async () => {
    const registry = new ActionRegistry();
    const stores = create_ui_stores();
    const { refresh_called } = register_actions_for_test(registry, stores);

    expect(stores.ui.vault_dashboard.open).toBe(false);

    await registry.execute(ACTION_IDS.ui_open_vault_dashboard);
    expect(stores.ui.vault_dashboard.open).toBe(true);
    expect(refresh_called()).toBe(1);

    await registry.execute(ACTION_IDS.ui_close_vault_dashboard);
    expect(stores.ui.vault_dashboard.open).toBe(false);
  });

  it("accepts dashboard sidebar view", async () => {
    const registry = new ActionRegistry();
    const stores = create_ui_stores();
    const { refresh_called } = register_actions_for_test(registry, stores);

    expect(stores.ui.sidebar_view).toBe("explorer");
    await registry.execute(ACTION_IDS.ui_set_sidebar_view, "dashboard");
    expect(stores.ui.sidebar_view).toBe("dashboard");
    expect(refresh_called()).toBe(1);
  });

  it.runIf(__CARBIDE_LITE__)(
    "does not register full-only ui actions for lite",
    async () => {
      const registry = new ActionRegistry();
      const stores = create_ui_stores();

      register_actions_for_test(registry, stores);

      const registered = new Set(registry.get_all().map((action) => action.id));

      expect(registered.has(ACTION_IDS.ui_open_vault_dashboard)).toBe(false);
      expect(registered.has(ACTION_IDS.ui_close_vault_dashboard)).toBe(false);
      expect(registered.has(ACTION_IDS.ui_quick_capture)).toBe(false);
      expect(registered.has(ACTION_IDS.ui_toggle_tasks_panel)).toBe(false);
      expect(registered.has(ACTION_IDS.ui_show_tasks_list)).toBe(false);
      expect(registered.has(ACTION_IDS.ui_show_tasks_kanban)).toBe(false);
      expect(registered.has(ACTION_IDS.ui_show_tasks_schedule)).toBe(false);

      await registry.execute(ACTION_IDS.ui_set_sidebar_view, "dashboard");
      expect(stores.ui.sidebar_view).toBe("explorer");
    },
  );

  it("toggles zen mode", async () => {
    const registry = new ActionRegistry();
    const stores = create_ui_stores();

    register_actions_for_test(registry, stores);

    expect(stores.ui.zen_mode).toBe(false);
    await registry.execute(ACTION_IDS.ui_toggle_zen_mode);
    expect(stores.ui.zen_mode).toBe(true);
    await registry.execute(ACTION_IDS.ui_toggle_zen_mode);
    expect(stores.ui.zen_mode).toBe(false);
  });

  it("closes the graph when toggling the context rail", async () => {
    const registry = new ActionRegistry();
    const stores = create_ui_stores();

    stores.graph.set_panel_open(true);
    stores.ui.set_context_rail_tab("graph");

    const close_graph = vi.fn().mockImplementation(() => {
      stores.graph.clear();
      stores.ui.close_context_rail("links");
    });

    registry.register({
      id: ACTION_IDS.graph_close,
      label: "Close Graph",
      execute: close_graph,
    });

    register_actions_for_test(registry, stores);

    await registry.execute(ACTION_IDS.ui_toggle_context_rail);

    expect(close_graph).toHaveBeenCalledTimes(1);
    expect(stores.graph.panel_open).toBe(false);
    expect(stores.ui.context_rail_open).toBe(false);
  });

  it("toggles floating outline collapsed when outline_mode is floating", async () => {
    const registry = new ActionRegistry();
    const stores = create_ui_stores();

    stores.ui.set_editor_settings({
      ...stores.ui.editor_settings,
      outline_mode: "floating",
    });

    register_actions_for_test(registry, stores);

    expect(stores.ui.floating_outline_collapsed).toBe(false);

    await registry.execute(ACTION_IDS.ui_toggle_outline_panel);
    expect(stores.ui.floating_outline_collapsed).toBe(true);
    expect(stores.ui.context_rail_open).toBe(false);

    await registry.execute(ACTION_IDS.ui_toggle_outline_panel);
    expect(stores.ui.floating_outline_collapsed).toBe(false);
  });

  it("toggles context rail outline when outline_mode is rail", async () => {
    const registry = new ActionRegistry();
    const stores = create_ui_stores();

    register_actions_for_test(registry, stores);

    await registry.execute(ACTION_IDS.ui_toggle_outline_panel);
    expect(stores.ui.context_rail_open).toBe(true);
    expect(stores.ui.context_rail_tab).toBe("outline");

    await registry.execute(ACTION_IDS.ui_toggle_outline_panel);
    expect(stores.ui.context_rail_open).toBe(false);
  });

  it("switches from graph to outline by closing graph first", async () => {
    const registry = new ActionRegistry();
    const stores = create_ui_stores();

    stores.graph.set_panel_open(true);
    stores.ui.set_context_rail_tab("graph");

    const close_graph = vi.fn();

    registry.register({
      id: ACTION_IDS.graph_close,
      label: "Close Graph",
      execute: close_graph,
    });

    register_actions_for_test(registry, stores);

    await registry.execute(ACTION_IDS.ui_toggle_outline_panel);

    expect(close_graph).toHaveBeenCalledWith({ preserve_context_rail: true });
    expect(stores.ui.context_rail_open).toBe(true);
    expect(stores.ui.context_rail_tab).toBe("outline");
  });
});
