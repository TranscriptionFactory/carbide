import type { TerminalSpawnOptions } from "$lib/features/terminal/ports";

const terminal_name = "xterm-256color";

export function build_terminal_spawn_options(input: {
  cols: number;
  rows: number;
  vault_path?: string | undefined;
}): TerminalSpawnOptions {
  const { cols, rows, vault_path } = input;
  const options: TerminalSpawnOptions = {
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
