import {
  DEFAULT_TERMINAL_SESSION_ID,
  type TerminalCwdPolicy,
  type TerminalRespawnPolicy,
  type TerminalStore,
} from "$lib/features/terminal/state/terminal_store.svelte";
import type {
  TerminalExitEvent,
  TerminalPort,
  TerminalSessionHandle,
} from "$lib/features/terminal/ports";
import { build_terminal_spawn_options } from "$lib/features/terminal/domain/build_terminal_spawn_options";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("terminal_service");

export type TerminalSessionRequest = {
  cols: number;
  rows: number;
  shell_path: string;
  cwd?: string | undefined;
  cwd_policy: TerminalCwdPolicy;
  respawn_policy: TerminalRespawnPolicy;
};

export type TerminalSessionReconcileInput = Omit<
  TerminalSessionRequest,
  "cols" | "rows"
>;

export type TerminalViewSinks = {
  on_output: (data: Uint8Array) => void;
  on_exit: (event: TerminalExitEvent) => void;
};

type TerminalRuntimeSession = {
  process: TerminalSessionHandle | null;
  views: Map<string, TerminalViewSinks>;
  output_unsubscribe: (() => void) | null;
  exit_unsubscribe: (() => void) | null;
};

export class TerminalService {
  private readonly runtimes = new Map<string, TerminalRuntimeSession>();
  private next_view_id = 0;
  private next_session_id = 0;

  constructor(
    private readonly terminal_port: TerminalPort,
    private readonly terminal_store: TerminalStore,
  ) {}

  async ensure_active_session(
    input: TerminalSessionRequest,
    initial_view?: TerminalViewSinks,
  ): Promise<{ session_id: string; view_id: string | null }> {
    return this.ensure_session(
      this.terminal_store.active_session_id ?? DEFAULT_TERMINAL_SESSION_ID,
      input,
      initial_view,
      {
        activate: true,
      },
    );
  }

  async ensure_session(
    session_id: string,
    input: TerminalSessionRequest,
    initial_view?: TerminalViewSinks,
    options?: {
      activate?: boolean;
    },
  ): Promise<{ session_id: string; view_id: string | null }> {
    this.terminal_store.ensure_session(
      {
        id: session_id,
        shell_path: input.shell_path,
        cwd: input.cwd ?? null,
        cwd_policy: input.cwd_policy,
        respawn_policy: input.respawn_policy,
      },
      {
        activate: options?.activate ?? false,
      },
    );

    const runtime = this.ensure_runtime(session_id);
    const view_id = initial_view
      ? this.register_view(runtime, initial_view)
      : null;

    if (!runtime.process) {
      await this.spawn_session(session_id, runtime, input);
    }

    this.terminal_store.open();
    if (options?.activate ?? false) {
      this.terminal_store.set_active_session(session_id);
    }

    return {
      session_id,
      view_id,
    };
  }

  async create_session(
    input: TerminalSessionRequest,
    initial_view?: TerminalViewSinks,
  ): Promise<{ session_id: string; view_id: string | null }> {
    this.next_session_id += 1;

    return this.ensure_session(
      `terminal:session:${String(this.next_session_id)}`,
      input,
      initial_view,
      {
        activate: true,
      },
    );
  }

  attach_view(session_id: string, sinks: TerminalViewSinks): string {
    const runtime = this.ensure_runtime(session_id);
    return this.register_view(runtime, sinks);
  }

  detach_view(session_id: string, view_id: string): void {
    this.runtimes.get(session_id)?.views.delete(view_id);
  }

  write_active_session(data: string): void {
    const session_id = this.terminal_store.active_session_id;
    if (!session_id) {
      return;
    }

    this.write_session(session_id, data);
  }

  write_session(session_id: string, data: string): void {
    const runtime = this.runtimes.get(session_id);
    if (!runtime?.process) {
      return;
    }

    this.terminal_port.write_input(runtime.process, data);
  }

  resize_active_session(cols: number, rows: number): void {
    const session_id = this.terminal_store.active_session_id;
    if (!session_id) {
      return;
    }

    this.resize_session(session_id, cols, rows);
  }

  resize_session(session_id: string, cols: number, rows: number): void {
    const runtime = this.runtimes.get(session_id);
    if (!runtime?.process) {
      return;
    }

    runtime.process.cols = cols;
    runtime.process.rows = rows;
    this.terminal_port.resize_session(runtime.process, cols, rows);
  }

  async respawn_active_session(input: TerminalSessionRequest): Promise<string> {
    const session_id =
      this.terminal_store.active_session_id ?? DEFAULT_TERMINAL_SESSION_ID;
    await this.respawn_session(session_id, input);
    return session_id;
  }

  async respawn_session(
    session_id: string,
    input: TerminalSessionRequest,
  ): Promise<string> {
    const runtime = this.ensure_runtime(session_id);

    this.terminal_store.ensure_session(
      {
        id: session_id,
        shell_path: input.shell_path,
        cwd: input.cwd ?? null,
        cwd_policy: input.cwd_policy,
        respawn_policy: input.respawn_policy,
      },
      {
        activate: false,
      },
    );

    this.cleanup_process(runtime, true);
    await this.spawn_session(session_id, runtime, input);
    return session_id;
  }

  async reconcile_session(
    session_id: string,
    input: TerminalSessionReconcileInput,
  ): Promise<string> {
    if (input.respawn_policy === "manual") {
      this.terminal_store.ensure_session(
        {
          id: session_id,
          shell_path: input.shell_path,
          cwd: input.cwd ?? null,
          cwd_policy: input.cwd_policy,
          respawn_policy: input.respawn_policy,
        },
        { activate: false },
      );
      return session_id;
    }

    const runtime = this.ensure_runtime(session_id);

    return this.respawn_session(session_id, {
      cols: runtime.process?.cols ?? 80,
      rows: runtime.process?.rows ?? 24,
      shell_path: input.shell_path,
      cwd: input.cwd,
      cwd_policy: input.cwd_policy,
      respawn_policy: input.respawn_policy,
    });
  }

  activate_session(session_id: string): void {
    if (!this.terminal_store.get_session(session_id)) {
      return;
    }

    this.terminal_store.open();
    this.terminal_store.set_active_session(session_id);
  }

  close_active_session(): void {
    const session_id = this.terminal_store.active_session_id;
    if (!session_id) {
      return;
    }

    this.close_session(session_id);
  }

  close_session(session_id: string): void {
    const runtime = this.runtimes.get(session_id);
    if (runtime) {
      this.cleanup_process(runtime, true);
      runtime.views.clear();
      this.runtimes.delete(session_id);
    }

    this.terminal_store.remove_session(session_id);
  }

  close_all_sessions(): void {
    for (const runtime of this.runtimes.values()) {
      this.cleanup_process(runtime, true);
      runtime.views.clear();
    }

    this.runtimes.clear();
    this.terminal_store.reset();
  }

  destroy(): void {
    this.close_all_sessions();
  }

  private ensure_runtime(session_id: string): TerminalRuntimeSession {
    const existing = this.runtimes.get(session_id);
    if (existing) {
      return existing;
    }

    const runtime: TerminalRuntimeSession = {
      process: null,
      views: new Map(),
      output_unsubscribe: null,
      exit_unsubscribe: null,
    };
    this.runtimes.set(session_id, runtime);
    return runtime;
  }

  private register_view(
    runtime: TerminalRuntimeSession,
    sinks: TerminalViewSinks,
  ): string {
    const view_id = `terminal-view:${String(++this.next_view_id)}`;
    runtime.views.set(view_id, sinks);
    return view_id;
  }

  private async spawn_session(
    session_id: string,
    runtime: TerminalRuntimeSession,
    input: TerminalSessionRequest,
  ): Promise<void> {
    try {
      const process = await this.terminal_port.spawn_session(
        input.shell_path,
        [],
        build_terminal_spawn_options({
          cols: input.cols,
          rows: input.rows,
          vault_path: input.cwd,
        }),
      );

      runtime.process = process;
      runtime.output_unsubscribe = this.terminal_port.subscribe_output(
        process,
        (data) => {
          for (const view of runtime.views.values()) {
            view.on_output(data);
          }
        },
      );
      runtime.exit_unsubscribe = this.terminal_port.subscribe_exit(
        process,
        (event) => {
          this.cleanup_process(runtime, false);
          this.terminal_store.mark_session_exited(session_id, event.exit_code);
          for (const view of runtime.views.values()) {
            view.on_exit(event);
          }
        },
      );
      this.terminal_store.mark_session_running(session_id);
    } catch (error) {
      this.terminal_store.mark_session_exited(session_id, null);
      log.error("Failed to spawn terminal session", {
        error: String(error),
        session_id,
      });
      throw error;
    }
  }

  private cleanup_process(
    runtime: TerminalRuntimeSession,
    kill_process: boolean,
  ): void {
    runtime.output_unsubscribe?.();
    runtime.exit_unsubscribe?.();
    runtime.output_unsubscribe = null;
    runtime.exit_unsubscribe = null;

    if (kill_process && runtime.process) {
      this.terminal_port.kill_session(runtime.process);
    }

    runtime.process = null;
  }
}
