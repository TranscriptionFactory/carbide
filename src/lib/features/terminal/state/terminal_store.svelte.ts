export type TerminalCwdPolicy = "fixed" | "follow_active_vault";
export type TerminalRespawnPolicy = "manual" | "on_context_change";
export type TerminalSessionStatus = "idle" | "running" | "exited";

export type TerminalSessionMeta = {
  id: string;
  shell_path: string;
  cwd: string | null;
  cwd_policy: TerminalCwdPolicy;
  respawn_policy: TerminalRespawnPolicy;
  status: TerminalSessionStatus;
  last_exit_code: number | null;
};

export const DEFAULT_TERMINAL_SESSION_ID = "terminal:primary";

export class TerminalStore {
  panel_open = $state(false);
  focused = $state(false);
  active_session_id = $state<string | null>(null);
  session_ids = $state<string[]>([]);
  sessions = $state<Map<string, TerminalSessionMeta>>(new Map());

  open() {
    this.panel_open = true;
  }

  close() {
    this.panel_open = false;
    this.focused = false;
    this.active_session_id = null;
    this.session_ids = [];
    this.sessions = new Map();
  }

  ensure_session(
    input: Omit<TerminalSessionMeta, "last_exit_code" | "status"> & {
      status?: TerminalSessionStatus;
      last_exit_code?: number | null;
    },
  ): string {
    const existing = this.sessions.get(input.id);
    const next_state: TerminalSessionMeta = {
      id: input.id,
      shell_path: input.shell_path,
      cwd: input.cwd,
      cwd_policy: input.cwd_policy,
      respawn_policy: input.respawn_policy,
      status: input.status ?? existing?.status ?? "idle",
      last_exit_code: input.last_exit_code ?? existing?.last_exit_code ?? null,
    };

    const next_sessions = new Map(this.sessions);
    next_sessions.set(input.id, next_state);
    this.sessions = next_sessions;

    if (!this.session_ids.includes(input.id)) {
      this.session_ids = [...this.session_ids, input.id];
    }

    this.active_session_id = input.id;
    return input.id;
  }

  get_session(session_id: string | null): TerminalSessionMeta | undefined {
    if (!session_id) {
      return undefined;
    }
    return this.sessions.get(session_id);
  }

  mark_session_running(session_id: string) {
    this.#patch(session_id, {
      status: "running",
      last_exit_code: null,
    });
  }

  mark_session_exited(session_id: string, exit_code: number | null) {
    this.#patch(session_id, {
      status: "exited",
      last_exit_code: exit_code,
    });
  }

  set_active_session(session_id: string | null) {
    this.active_session_id = session_id;
  }

  set_focused(value: boolean) {
    this.focused = value;
  }

  remove_session(session_id: string) {
    const next_sessions = new Map(this.sessions);
    next_sessions.delete(session_id);
    this.sessions = next_sessions;
    this.session_ids = this.session_ids.filter((id) => id !== session_id);

    if (this.active_session_id === session_id) {
      this.active_session_id = this.session_ids[0] ?? null;
    }

    if (this.session_ids.length === 0) {
      this.focused = false;
    }
  }

  reset() {
    this.close();
  }

  #patch(session_id: string, fields: Partial<TerminalSessionMeta>) {
    const existing = this.sessions.get(session_id);
    if (!existing) {
      return;
    }

    this.sessions = new Map(this.sessions).set(session_id, {
      ...existing,
      ...fields,
    });
  }
}
