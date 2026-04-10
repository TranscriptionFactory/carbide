/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
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
import { BasesStore } from "$lib/features/bases/state/bases_store.svelte";
import { TaskStore } from "$lib/features/task/state/task_store.svelte";
import { GraphStore } from "$lib/features/graph";
import { OutlineStore } from "$lib/features/outline";
import { ParsedNoteCache } from "$lib/features/note/state/parsed_note_cache.svelte";
import { ReferenceStore } from "$lib/features/reference/state/reference_store.svelte";
import { SttStore } from "$lib/features/stt";

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

  const ui_store = new UIStore();

  register_terminal_actions({
    registry,
    terminal_store,
    terminal_service: terminal_service as never,
    ui_store,
    stores: {
      ui: ui_store,
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
      stt: new SttStore(),
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
    ui_store,
  };
}

describe("register_terminal_actions", () => {
  it("opens the terminal panel on toggle when closed", async () => {
    const { registry, terminal_store, terminal_service, ui_store } =
      create_harness();

    await registry.execute(ACTION_IDS.terminal_toggle);

    expect(ui_store.bottom_panel_open).toBe(true);
    expect(ui_store.bottom_panel_tab).toBe("terminal");
    expect(terminal_store.panel_open).toBe(true);
    expect(terminal_service.close_all_sessions).not.toHaveBeenCalled();
  });

  it("hides the panel on toggle when already open on terminal tab (sessions preserved)", async () => {
    const { registry, terminal_store, terminal_service, ui_store } =
      create_harness();
    ui_store.bottom_panel_open = true;
    ui_store.bottom_panel_tab = "terminal";
    terminal_store.open();
    terminal_store.ensure_session({
      id: "terminal:session:1",
      shell_path: "/bin/zsh",
      cwd: null,
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });

    await registry.execute(ACTION_IDS.terminal_toggle);

    expect(terminal_service.close_all_sessions).not.toHaveBeenCalled();
    expect(ui_store.bottom_panel_open).toBe(false);
    expect(terminal_store.panel_open).toBe(false);
    expect(terminal_store.session_ids).toEqual(["terminal:session:1"]);
  });

  it("switches to terminal tab when panel open on different tab", async () => {
    const { registry, terminal_store, terminal_service, ui_store } =
      create_harness();
    ui_store.bottom_panel_open = true;
    ui_store.bottom_panel_tab = "problems";

    await registry.execute(ACTION_IDS.terminal_toggle);

    expect(ui_store.bottom_panel_tab).toBe("terminal");
    expect(ui_store.bottom_panel_open).toBe(true);
    expect(terminal_store.panel_open).toBe(true);
    expect(terminal_service.close_all_sessions).not.toHaveBeenCalled();
  });

  it("hides the terminal explicitly without killing sessions", async () => {
    const { registry, terminal_store, terminal_service, ui_store } =
      create_harness();
    ui_store.bottom_panel_open = true;
    ui_store.bottom_panel_tab = "terminal";
    terminal_store.open();
    terminal_store.ensure_session({
      id: "terminal:session:1",
      shell_path: "/bin/zsh",
      cwd: null,
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });

    await registry.execute(ACTION_IDS.terminal_close);

    expect(terminal_service.close_all_sessions).not.toHaveBeenCalled();
    expect(ui_store.bottom_panel_open).toBe(false);
    expect(terminal_store.panel_open).toBe(false);
    expect(terminal_store.session_ids).toEqual(["terminal:session:1"]);
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
    const mock_call = vi.mocked(terminal_service.create_session).mock.calls[0];
    const call_args = mock_call ? mock_call[0] : null;
    expect(call_args).toBeDefined();
    expect(call_args?.shell_path).toBeDefined();
    expect(call_args?.cols).toBe(80);
    expect(call_args?.rows).toBe(24);
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
    const { registry, terminal_store, terminal_service, ui_store } =
      create_harness();

    ui_store.bottom_panel_open = true;
    ui_store.bottom_panel_tab = "terminal";
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
    expect(ui_store.bottom_panel_open).toBe(false);
    expect(terminal_store.session_ids).toEqual([]);
  });
});
