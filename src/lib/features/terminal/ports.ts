export type TerminalSpawnOptions = {
  cols: number;
  rows: number;
  cwd?: string;
  env?: Record<string, string | undefined>;
  name?: string;
};

export type TerminalSessionHandle = {
  id: string;
  cols: number;
  rows: number;
  process: string;
  raw: unknown;
};

export type TerminalExitEvent = {
  exit_code: number;
  signal?: number;
};

export interface TerminalPort {
  spawn_session(
    file: string,
    args: string[],
    options: TerminalSpawnOptions,
  ): Promise<TerminalSessionHandle>;
  write_input(session: TerminalSessionHandle, data: string): void;
  resize_session(
    session: TerminalSessionHandle,
    cols: number,
    rows: number,
  ): void;
  kill_session(session: TerminalSessionHandle): void;
  subscribe_output(
    session: TerminalSessionHandle,
    listener: (data: Uint8Array) => void,
  ): () => void;
  subscribe_exit(
    session: TerminalSessionHandle,
    listener: (event: TerminalExitEvent) => void,
  ): () => void;
}
