import type { IPtyForkOptions } from "tauri-pty";

const terminal_name = "xterm-256color";

export function build_terminal_spawn_options(input: {
  cols: number;
  rows: number;
  vault_path?: string | undefined;
}): IPtyForkOptions {
  const { cols, rows, vault_path } = input;
  const options: IPtyForkOptions = {
    cols,
    rows,
    name: terminal_name,
    env: {
      COLORTERM: "truecolor",
      TERM: terminal_name,
      TERM_PROGRAM: "otterly",
    },
  };

  if (vault_path) {
    options.cwd = vault_path;
  }

  return options;
}
