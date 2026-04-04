import { describe, expect, it } from "vitest";
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
import { OutlineStore } from "$lib/features/outline";
import { ParsedNoteCache } from "$lib/features/note/state/parsed_note_cache.svelte";

function create_lite_stores() {
  return {
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
}

function register_lite_ui_actions(
  registry: ActionRegistry,
  stores: ReturnType<typeof create_lite_stores>,
) {
  register_ui_actions({
    registry,
    app_target: "lite",
    stores,
    services: {
      reference: {},
      vault: {
        refresh_dashboard_stats: async () => ({
          status: "skipped" as const,
        }),
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
}

describe("lite guard paths", () => {
  it("ui_toggle_context_rail skips graph close when graph store absent", async () => {
    const registry = new ActionRegistry();
    const stores = create_lite_stores();

    stores.ui.set_context_rail_tab("links");
    expect(stores.ui.context_rail_open).toBe(true);

    register_lite_ui_actions(registry, stores);

    await registry.execute(ACTION_IDS.ui_toggle_context_rail);

    expect(stores.ui.context_rail_open).toBe(false);
  });

  it("ui_toggle_context_rail toggles open when graph store absent", async () => {
    const registry = new ActionRegistry();
    const stores = create_lite_stores();

    expect(stores.ui.context_rail_open).toBe(false);

    register_lite_ui_actions(registry, stores);

    await registry.execute(ACTION_IDS.ui_toggle_context_rail);

    expect(stores.ui.context_rail_open).toBe(true);
  });

  it("ui_toggle_outline_panel opens outline without graph close when graph store absent", async () => {
    const registry = new ActionRegistry();
    const stores = create_lite_stores();

    register_lite_ui_actions(registry, stores);

    await registry.execute(ACTION_IDS.ui_toggle_outline_panel);

    expect(stores.ui.context_rail_open).toBe(true);
    expect(stores.ui.context_rail_tab).toBe("outline");
  });

  it("ui_toggle_outline_panel closes outline when already open", async () => {
    const registry = new ActionRegistry();
    const stores = create_lite_stores();

    register_lite_ui_actions(registry, stores);

    await registry.execute(ACTION_IDS.ui_toggle_outline_panel);
    expect(stores.ui.context_rail_open).toBe(true);

    await registry.execute(ACTION_IDS.ui_toggle_outline_panel);
    expect(stores.ui.context_rail_open).toBe(false);
  });
});
