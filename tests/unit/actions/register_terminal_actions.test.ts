import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import {
  register_terminal_actions,
  TerminalStore,
} from "$lib/features/terminal";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { OutlineStore } from "$lib/features/outline";
import { SplitViewStore } from "$lib/features/split_view";

function create_harness() {
  const registry = new ActionRegistry();
  const terminal_store = new TerminalStore();
  const terminal_service = {
    close_active_session: vi.fn(),
  };

  register_terminal_actions({
    registry,
    terminal_store,
    terminal_service: terminal_service as never,
    stores: {
      ui: new UIStore(),
      vault: new VaultStore(),
      notes: new NotesStore(),
      editor: new EditorStore(),
      op: new OpStore(),
      search: new SearchStore(),
      tab: new TabStore(),
      git: new GitStore(),
      outline: new OutlineStore(),
      split_view: new SplitViewStore(),
    },
    services: {} as never,
    default_mount_config: {
      reset_app_state: false,
      bootstrap_default_vault_path: null,
    },
  });

  return {
    registry,
    terminal_store,
    terminal_service,
  };
}

describe("register_terminal_actions", () => {
  it("opens the terminal panel on toggle when closed", async () => {
    const { registry, terminal_store, terminal_service } = create_harness();

    await registry.execute(ACTION_IDS.terminal_toggle);

    expect(terminal_store.panel_open).toBe(true);
    expect(terminal_service.close_active_session).not.toHaveBeenCalled();
  });

  it("closes the active session on toggle when already open", async () => {
    const { registry, terminal_store, terminal_service } = create_harness();
    terminal_store.open();

    await registry.execute(ACTION_IDS.terminal_toggle);

    expect(terminal_service.close_active_session).toHaveBeenCalledTimes(1);
    expect(terminal_store.panel_open).toBe(false);
  });

  it("closes the terminal explicitly", async () => {
    const { registry, terminal_store, terminal_service } = create_harness();
    terminal_store.open();

    await registry.execute(ACTION_IDS.terminal_close);

    expect(terminal_service.close_active_session).toHaveBeenCalledTimes(1);
    expect(terminal_store.panel_open).toBe(false);
  });
});
