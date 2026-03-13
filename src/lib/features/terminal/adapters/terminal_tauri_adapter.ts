import type { IPty, IPtyForkOptions } from "tauri-pty";
import type {
  TerminalExitEvent,
  TerminalPort,
  TerminalSessionHandle,
  TerminalSpawnOptions,
} from "$lib/features/terminal/ports";

let tauri_pty_loader: Promise<typeof import("tauri-pty")> | null = null;

function load_tauri_pty() {
  tauri_pty_loader ??= import("tauri-pty");
  return tauri_pty_loader;
}

function resolve_raw_session(session: TerminalSessionHandle): IPty {
  return session.raw as IPty;
}

export function create_terminal_tauri_adapter(): TerminalPort {
  return {
    async spawn_session(
      file: string,
      args: string[],
      options: TerminalSpawnOptions,
    ): Promise<TerminalSessionHandle> {
      const { spawn } = await load_tauri_pty();
      const raw = spawn(file, args, options as IPtyForkOptions);

      return {
        id: `pty:${String(raw.pid)}`,
        cols: raw.cols,
        rows: raw.rows,
        process: raw.process,
        raw,
      };
    },
    write_input(session: TerminalSessionHandle, data: string) {
      resolve_raw_session(session).write(data);
    },
    resize_session(session: TerminalSessionHandle, cols: number, rows: number) {
      resolve_raw_session(session).resize(cols, rows);
    },
    kill_session(session: TerminalSessionHandle) {
      resolve_raw_session(session).kill();
    },
    subscribe_output(
      session: TerminalSessionHandle,
      listener: (data: Uint8Array) => void,
    ): () => void {
      const disposable = resolve_raw_session(session).onData(
        (data: Uint8Array | number[]) => {
          listener(data instanceof Uint8Array ? data : new Uint8Array(data));
        },
      );
      return () => {
        disposable.dispose();
      };
    },
    subscribe_exit(
      session: TerminalSessionHandle,
      listener: (event: TerminalExitEvent) => void,
    ): () => void {
      const disposable = resolve_raw_session(session).onExit((event) => {
        listener(
          event.signal === undefined
            ? { exit_code: event.exitCode }
            : {
                exit_code: event.exitCode,
                signal: event.signal,
              },
        );
      });
      return () => {
        disposable.dispose();
      };
    },
  };
}
