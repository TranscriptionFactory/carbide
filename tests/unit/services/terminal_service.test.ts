import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TERMINAL_SESSION_ID,
  TerminalService,
  TerminalStore,
  type TerminalExitEvent,
  type TerminalPort,
  type TerminalSessionHandle,
  type TerminalSpawnOptions,
} from "$lib/features/terminal";

function create_terminal_service_harness() {
  const output_unsubscribe = vi.fn();
  const exit_unsubscribe = vi.fn();
  let output_listener: ((data: Uint8Array) => void) | null = null;
  let exit_listener: ((event: TerminalExitEvent) => void) | null = null;

  const spawn_session = vi.fn(
    (_file: string, _args: string[], options: TerminalSpawnOptions) =>
      Promise.resolve<TerminalSessionHandle>({
        id: "pty:1",
        cols: options.cols,
        rows: options.rows,
        process: "/bin/zsh",
        raw: null,
      }),
  );
  const write_input = vi.fn(
    (_session: TerminalSessionHandle, _data: string): void => {},
  );
  const resize_session = vi.fn(
    (_session: TerminalSessionHandle, _cols: number, _rows: number): void => {},
  );
  const kill_session = vi.fn((_session: TerminalSessionHandle): void => {});
  const subscribe_output = vi.fn(
    (
      _session: TerminalSessionHandle,
      listener: (data: Uint8Array) => void,
    ): (() => void) => {
      output_listener = listener;
      return output_unsubscribe;
    },
  );
  const subscribe_exit = vi.fn(
    (
      _session: TerminalSessionHandle,
      listener: (event: TerminalExitEvent) => void,
    ): (() => void) => {
      exit_listener = listener;
      return exit_unsubscribe;
    },
  );

  const port: TerminalPort = {
    spawn_session,
    write_input,
    resize_session,
    kill_session,
    subscribe_output,
    subscribe_exit,
  };
  const store = new TerminalStore();
  const service = new TerminalService(port, store);

  const emit_output = (data: string) => {
    output_listener?.(new TextEncoder().encode(data));
  };
  const emit_exit = (event: TerminalExitEvent) => {
    exit_listener?.(event);
  };

  return {
    service,
    store,
    spawn_session,
    write_input,
    resize_session,
    kill_session,
    emit_output,
    emit_exit,
    output_unsubscribe,
    exit_unsubscribe,
  };
}

describe("TerminalService", () => {
  it("spawns and marks the active session running", async () => {
    const { service, store, spawn_session } = create_terminal_service_harness();

    const result = await service.ensure_active_session({
      cols: 120,
      rows: 40,
      shell_path: "/bin/zsh",
      cwd: "/vault",
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });

    expect(result.session_id).toBe(DEFAULT_TERMINAL_SESSION_ID);
    expect(store.panel_open).toBe(true);
    expect(store.active_session_id).toBe(DEFAULT_TERMINAL_SESSION_ID);
    expect(store.get_session(DEFAULT_TERMINAL_SESSION_ID)?.status).toBe(
      "running",
    );
    expect(spawn_session).toHaveBeenCalledWith(
      "/bin/zsh",
      [],
      expect.objectContaining({
        cols: 120,
        rows: 40,
        cwd: "/vault",
      }),
    );
  });

  it("fans out output and exit events to attached views", async () => {
    const harness = create_terminal_service_harness();
    const { service, store, emit_output, emit_exit } = harness;
    const primary_output = vi.fn();
    const primary_exit = vi.fn();
    const secondary_output = vi.fn();
    const secondary_exit = vi.fn();

    const { session_id } = await service.ensure_active_session(
      {
        cols: 80,
        rows: 24,
        shell_path: "/bin/zsh",
        cwd: undefined,
        cwd_policy: "fixed",
        respawn_policy: "manual",
      },
      {
        on_output: primary_output,
        on_exit: primary_exit,
      },
    );

    service.attach_view(session_id, {
      on_output: secondary_output,
      on_exit: secondary_exit,
    });

    emit_output("hello");
    emit_exit({ exit_code: 9 });

    expect(primary_output).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect(secondary_output).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect(primary_exit).toHaveBeenCalledWith({ exit_code: 9 });
    expect(secondary_exit).toHaveBeenCalledWith({ exit_code: 9 });
    expect(store.get_session(session_id)?.status).toBe("exited");
    expect(store.get_session(session_id)?.last_exit_code).toBe(9);
  });

  it("writes input and resizes the active session", async () => {
    const { service, write_input, resize_session } =
      create_terminal_service_harness();

    await service.ensure_active_session({
      cols: 80,
      rows: 24,
      shell_path: "/bin/zsh",
      cwd: undefined,
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });

    service.write_active_session("pwd\n");
    service.resize_active_session(100, 32);

    expect(write_input).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pty:1" }),
      "pwd\n",
    );
    expect(resize_session).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pty:1" }),
      100,
      32,
    );
  });

  it("creates and activates a new session without disturbing the existing one", async () => {
    const { service, store, spawn_session } = create_terminal_service_harness();

    await service.ensure_active_session({
      cols: 80,
      rows: 24,
      shell_path: "/bin/zsh",
      cwd: "/vault-a",
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });

    const created = await service.create_session({
      cols: 120,
      rows: 40,
      shell_path: "/bin/bash",
      cwd: "/vault-b",
      cwd_policy: "follow_active_vault",
      respawn_policy: "on_context_change",
    });

    expect(created.session_id).toBe("terminal:session:1");
    expect(store.active_session_id).toBe("terminal:session:1");
    expect(store.session_ids).toEqual([
      DEFAULT_TERMINAL_SESSION_ID,
      "terminal:session:1",
    ]);
    expect(store.get_session(DEFAULT_TERMINAL_SESSION_ID)?.status).toBe(
      "running",
    );
    expect(store.get_session("terminal:session:1")).toMatchObject({
      shell_path: "/bin/bash",
      cwd: "/vault-b",
      cwd_policy: "follow_active_vault",
      respawn_policy: "on_context_change",
      status: "running",
    });
    expect(spawn_session).toHaveBeenCalledTimes(2);
  });

  it("activates and writes to a specific session", async () => {
    const { service, store, write_input, resize_session } =
      create_terminal_service_harness();

    await service.ensure_active_session({
      cols: 80,
      rows: 24,
      shell_path: "/bin/zsh",
      cwd: "/vault-a",
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });
    await service.create_session({
      cols: 100,
      rows: 30,
      shell_path: "/bin/bash",
      cwd: "/vault-b",
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });

    service.activate_session(DEFAULT_TERMINAL_SESSION_ID);
    service.write_session(DEFAULT_TERMINAL_SESSION_ID, "ls\n");
    service.resize_session(DEFAULT_TERMINAL_SESSION_ID, 90, 28);

    expect(store.active_session_id).toBe(DEFAULT_TERMINAL_SESSION_ID);
    expect(write_input).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pty:1" }),
      "ls\n",
    );
    expect(resize_session).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pty:1" }),
      90,
      28,
    );
  });

  it("respawns the active session with updated runtime metadata", async () => {
    const {
      service,
      store,
      kill_session,
      spawn_session,
      output_unsubscribe,
      exit_unsubscribe,
    } = create_terminal_service_harness();

    await service.ensure_active_session({
      cols: 80,
      rows: 24,
      shell_path: "/bin/zsh",
      cwd: "/vault-a",
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });

    await service.respawn_active_session({
      cols: 100,
      rows: 30,
      shell_path: "/bin/bash",
      cwd: "/vault-b",
      cwd_policy: "follow_active_vault",
      respawn_policy: "on_context_change",
    });

    expect(kill_session).toHaveBeenCalledTimes(1);
    expect(spawn_session).toHaveBeenCalledTimes(2);
    expect(output_unsubscribe).toHaveBeenCalledTimes(1);
    expect(exit_unsubscribe).toHaveBeenCalledTimes(1);
    expect(store.get_session(DEFAULT_TERMINAL_SESSION_ID)).toMatchObject({
      shell_path: "/bin/bash",
      cwd: "/vault-b",
      cwd_policy: "follow_active_vault",
      respawn_policy: "on_context_change",
      status: "running",
    });
  });

  it("reconciles a session with its current runtime dimensions", async () => {
    const { service, kill_session, spawn_session, resize_session } =
      create_terminal_service_harness();

    await service.ensure_active_session({
      cols: 80,
      rows: 24,
      shell_path: "/bin/zsh",
      cwd: "/vault-a",
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });

    service.resize_session(DEFAULT_TERMINAL_SESSION_ID, 132, 41);
    await service.reconcile_session(DEFAULT_TERMINAL_SESSION_ID, {
      shell_path: "/bin/bash",
      cwd: "/vault-b",
      cwd_policy: "follow_active_vault",
      respawn_policy: "on_context_change",
    });

    expect(resize_session).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pty:1" }),
      132,
      41,
    );
    expect(kill_session).toHaveBeenCalledTimes(1);
    expect(spawn_session).toHaveBeenLastCalledWith(
      "/bin/bash",
      [],
      expect.objectContaining({
        cols: 132,
        rows: 41,
        cwd: "/vault-b",
      }),
    );
  });

  it("reconciles a manual-policy session with metadata-only update (no kill, no respawn)", async () => {
    const { service, store, kill_session, spawn_session } =
      create_terminal_service_harness();

    await service.ensure_active_session({
      cols: 80,
      rows: 24,
      shell_path: "/bin/zsh",
      cwd: "/vault-a",
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });

    expect(spawn_session).toHaveBeenCalledTimes(1);

    await service.reconcile_session(DEFAULT_TERMINAL_SESSION_ID, {
      shell_path: "/bin/zsh",
      cwd: "/vault-b",
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });

    expect(kill_session).not.toHaveBeenCalled();
    expect(spawn_session).toHaveBeenCalledTimes(1);
    expect(store.get_session(DEFAULT_TERMINAL_SESSION_ID)).toMatchObject({
      cwd: "/vault-b",
      cwd_policy: "fixed",
      respawn_policy: "manual",
      status: "running",
    });
  });

  it("closes the active session and clears store state", async () => {
    const {
      service,
      store,
      kill_session,
      output_unsubscribe,
      exit_unsubscribe,
    } = create_terminal_service_harness();

    await service.ensure_active_session({
      cols: 80,
      rows: 24,
      shell_path: "/bin/zsh",
      cwd: undefined,
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });

    service.close_active_session();

    expect(kill_session).toHaveBeenCalledTimes(1);
    expect(output_unsubscribe).toHaveBeenCalledTimes(1);
    expect(exit_unsubscribe).toHaveBeenCalledTimes(1);
    expect(store.active_session_id).toBeNull();
    expect(store.session_ids).toEqual([]);
  });

  it("closes a non-active session without disturbing the active one", async () => {
    const { service, store, kill_session } = create_terminal_service_harness();

    await service.ensure_active_session({
      cols: 80,
      rows: 24,
      shell_path: "/bin/zsh",
      cwd: "/vault-a",
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });
    await service.create_session({
      cols: 100,
      rows: 30,
      shell_path: "/bin/bash",
      cwd: "/vault-b",
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });

    service.close_session(DEFAULT_TERMINAL_SESSION_ID);

    expect(kill_session).toHaveBeenCalledTimes(1);
    expect(store.session_ids).toEqual(["terminal:session:1"]);
    expect(store.active_session_id).toBe("terminal:session:1");
  });

  it("closes all sessions and resets the terminal store", async () => {
    const {
      service,
      store,
      kill_session,
      output_unsubscribe,
      exit_unsubscribe,
    } = create_terminal_service_harness();

    await service.ensure_active_session({
      cols: 80,
      rows: 24,
      shell_path: "/bin/zsh",
      cwd: "/vault-a",
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });
    await service.create_session({
      cols: 100,
      rows: 30,
      shell_path: "/bin/bash",
      cwd: "/vault-b",
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });

    service.close_all_sessions();

    expect(kill_session).toHaveBeenCalledTimes(2);
    expect(output_unsubscribe).toHaveBeenCalledTimes(2);
    expect(exit_unsubscribe).toHaveBeenCalledTimes(2);
    expect(store.panel_open).toBe(false);
    expect(store.session_ids).toEqual([]);
    expect(store.active_session_id).toBeNull();
  });
});
