import type {
  TerminalExitEvent,
  TerminalPort,
  TerminalSessionHandle,
  TerminalSpawnOptions,
} from "$lib/features/terminal";

function create_session_handle(
  options: TerminalSpawnOptions,
): TerminalSessionHandle {
  return {
    id: "pty:test",
    cols: options.cols,
    rows: options.rows,
    process: "/bin/zsh",
    raw: null,
  };
}

export function create_test_terminal_adapter(): TerminalPort {
  return {
    spawn_session(
      _file: string,
      _args: string[],
      options: TerminalSpawnOptions,
    ): Promise<TerminalSessionHandle> {
      return Promise.resolve(create_session_handle(options));
    },
    write_input(_session: TerminalSessionHandle, _data: string): void {},
    resize_session(
      _session: TerminalSessionHandle,
      _cols: number,
      _rows: number,
    ): void {},
    kill_session(_session: TerminalSessionHandle): void {},
    subscribe_output(
      _session: TerminalSessionHandle,
      _listener: (data: Uint8Array) => void,
    ): () => void {
      return () => {};
    },
    subscribe_exit(
      _session: TerminalSessionHandle,
      _listener: (event: TerminalExitEvent) => void,
    ): () => void {
      return () => {};
    },
  };
}
