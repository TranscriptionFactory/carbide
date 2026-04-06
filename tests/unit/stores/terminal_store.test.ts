import { describe, expect, it } from "vitest";
import {
  DEFAULT_TERMINAL_SESSION_ID,
  TerminalStore,
} from "$lib/features/terminal";

describe("TerminalStore", () => {
  it("starts with panel closed and no sessions", () => {
    const store = new TerminalStore();

    expect(store.panel_open).toBe(false);
    expect(store.active_session_id).toBeNull();
    expect(store.session_ids).toEqual([]);
    expect(store.sessions.size).toBe(0);
  });

  it("creates and activates a session", () => {
    const store = new TerminalStore();

    const session_id = store.ensure_session({
      id: DEFAULT_TERMINAL_SESSION_ID,
      shell_path: "/bin/zsh",
      cwd: "/vault",
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });

    expect(session_id).toBe(DEFAULT_TERMINAL_SESSION_ID);
    expect(store.active_session_id).toBe(DEFAULT_TERMINAL_SESSION_ID);
    expect(store.session_ids).toEqual([DEFAULT_TERMINAL_SESSION_ID]);
    expect(store.get_session(DEFAULT_TERMINAL_SESSION_ID)).toMatchObject({
      shell_path: "/bin/zsh",
      cwd: "/vault",
      cwd_policy: "fixed",
      respawn_policy: "manual",
      status: "idle",
      last_exit_code: null,
    });
  });

  it("updates a session without forcing activation when requested", () => {
    const store = new TerminalStore();

    store.ensure_session({
      id: DEFAULT_TERMINAL_SESSION_ID,
      shell_path: "/bin/zsh",
      cwd: "/vault-a",
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });
    store.ensure_session(
      {
        id: "terminal:session:1",
        shell_path: "/bin/bash",
        cwd: "/vault-b",
        cwd_policy: "follow_active_vault",
        respawn_policy: "on_context_change",
      },
      {
        activate: false,
      },
    );

    expect(store.active_session_id).toBe(DEFAULT_TERMINAL_SESSION_ID);
    expect(store.session_ids).toEqual([
      DEFAULT_TERMINAL_SESSION_ID,
      "terminal:session:1",
    ]);
  });

  it("marks sessions running and exited", () => {
    const store = new TerminalStore();

    store.ensure_session({
      id: DEFAULT_TERMINAL_SESSION_ID,
      shell_path: "/bin/zsh",
      cwd: null,
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });

    store.mark_session_running(DEFAULT_TERMINAL_SESSION_ID);
    expect(store.get_session(DEFAULT_TERMINAL_SESSION_ID)?.status).toBe(
      "running",
    );
    expect(
      store.get_session(DEFAULT_TERMINAL_SESSION_ID)?.last_exit_code,
    ).toBeNull();

    store.mark_session_exited(DEFAULT_TERMINAL_SESSION_ID, 12);
    expect(store.get_session(DEFAULT_TERMINAL_SESSION_ID)?.status).toBe(
      "exited",
    );
    expect(store.get_session(DEFAULT_TERMINAL_SESSION_ID)?.last_exit_code).toBe(
      12,
    );
  });

  it("removes the active session and clears focus when no sessions remain", () => {
    const store = new TerminalStore();
    store.open();
    store.set_focused(true);
    store.ensure_session({
      id: DEFAULT_TERMINAL_SESSION_ID,
      shell_path: "/bin/zsh",
      cwd: null,
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });

    store.remove_session(DEFAULT_TERMINAL_SESSION_ID);

    expect(store.active_session_id).toBeNull();
    expect(store.session_ids).toEqual([]);
    expect(store.focused).toBe(false);
  });

  it("hide closes the panel but preserves sessions", () => {
    const store = new TerminalStore();
    store.open();
    store.ensure_session({
      id: DEFAULT_TERMINAL_SESSION_ID,
      shell_path: "/bin/zsh",
      cwd: "/vault",
      cwd_policy: "follow_active_vault",
      respawn_policy: "on_context_change",
    });
    store.set_focused(true);

    store.hide();

    expect(store.panel_open).toBe(false);
    expect(store.focused).toBe(false);
    expect(store.active_session_id).toBe(DEFAULT_TERMINAL_SESSION_ID);
    expect(store.session_ids).toEqual([DEFAULT_TERMINAL_SESSION_ID]);
    expect(store.sessions.size).toBe(1);
  });

  it("close resets the panel and session state", () => {
    const store = new TerminalStore();
    store.open();
    store.ensure_session({
      id: DEFAULT_TERMINAL_SESSION_ID,
      shell_path: "/bin/zsh",
      cwd: "/vault",
      cwd_policy: "follow_active_vault",
      respawn_policy: "on_context_change",
    });
    store.set_focused(true);

    store.close();

    expect(store.panel_open).toBe(false);
    expect(store.focused).toBe(false);
    expect(store.active_session_id).toBeNull();
    expect(store.session_ids).toEqual([]);
    expect(store.sessions.size).toBe(0);
  });
});
