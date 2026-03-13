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
import { GraphStore } from "$lib/features/graph";
import { OutlineStore } from "$lib/features/outline";
import { SplitViewStore } from "$lib/features/split_view";

function create_harness() {
  const registry = new ActionRegistry();
  const terminal_store = new TerminalStore();
  const terminal_service = {
    activate_session: vi.fn(),
    close_active_session: vi.fn(),
    close_all_sessions: vi.fn(() => {
      terminal_store.close();
    }),
    close_session: vi.fn(),
    create_session: vi.fn(),
    respawn_session: vi.fn(),
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
    graph: new GraphStore(),
      graph: new GraphStore(),
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
    expect(terminal_service.close_all_sessions).not.toHaveBeenCalled();
  });

  it("closes all sessions on toggle when already open", async () => {
    const { registry, terminal_store, terminal_service } = create_harness();
    terminal_store.open();

    await registry.execute(ACTION_IDS.terminal_toggle);

    expect(terminal_service.close_all_sessions).toHaveBeenCalledTimes(1);
    expect(terminal_store.panel_open).toBe(false);
  });

  it("closes the terminal explicitly", async () => {
    const { registry, terminal_store, terminal_service } = create_harness();
    terminal_store.open();

    await registry.execute(ACTION_IDS.terminal_close);

    expect(terminal_service.close_all_sessions).toHaveBeenCalledTimes(1);
    expect(terminal_store.panel_open).toBe(false);
  });

  it("creates a new terminal session from an action payload", async () => {
    const { registry, terminal_service } = create_harness();

    const request = {
      cols: 80,
      rows: 24,
      shell_path: "/bin/zsh",
      cwd: "/vault",
      cwd_policy: "fixed",
      respawn_policy: "manual",
    };

    await registry.execute(ACTION_IDS.terminal_new_session, request);

    expect(terminal_service.create_session).toHaveBeenCalledWith(request);
  });

  it("handles missing request payload for new session by providing defaults", async () => {
    const { registry, terminal_service } = create_harness();

    await registry.execute(ACTION_IDS.terminal_new_session);

    expect(terminal_service.create_session).toHaveBeenCalled();
    const call_args = (terminal_service.create_session as any).mock.calls[0][0];
    expect(call_args).toBeDefined();
    expect(call_args.shell_path).toBeDefined();
    expect(call_args.cols).toBe(80);
    expect(call_args.rows).toBe(24);
  });

  it("activates and respawns a specific session", async () => {
    const { registry, terminal_service } = create_harness();

    const request = {
      cols: 100,
      rows: 30,
      shell_path: "/bin/bash",
      cwd: "/vault",
      cwd_policy: "follow_active_vault",
      respawn_policy: "on_context_change",
    };

    await registry.execute(
      ACTION_IDS.terminal_activate_session,
      "terminal:session:1",
    );
    await registry.execute(
      ACTION_IDS.terminal_respawn_session,
      "terminal:session:1",
      request,
    );

    expect(terminal_service.activate_session).toHaveBeenCalledWith(
      "terminal:session:1",
    );
    expect(terminal_service.respawn_session).toHaveBeenCalledWith(
      "terminal:session:1",
      request,
    );
  });

  it("closes the terminal panel when the last session is removed", async () => {
    const { registry, terminal_store, terminal_service } = create_harness();

    terminal_store.open();
    terminal_store.ensure_session({
      id: "terminal:session:1",
      shell_path: "/bin/zsh",
      cwd: null,
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });
    terminal_service.close_session.mockImplementation(() => {
      terminal_store.remove_session("terminal:session:1");
    });

    await registry.execute(
      ACTION_IDS.terminal_close_session,
      "terminal:session:1",
    );

    expect(terminal_service.close_session).toHaveBeenCalledWith(
      "terminal:session:1",
    );
    expect(terminal_store.panel_open).toBe(false);
    expect(terminal_store.session_ids).toEqual([]);
  });
});
