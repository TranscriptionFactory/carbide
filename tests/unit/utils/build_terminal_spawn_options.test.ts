import { describe, expect, it } from "vitest";
import { build_terminal_spawn_options } from "$lib/features/terminal/ui/build_terminal_spawn_options";

describe("build_terminal_spawn_options", () => {
  it("advertises xterm with truecolor support", () => {
    const options = build_terminal_spawn_options({
      cols: 120,
      rows: 40,
    });

    expect(options).toMatchObject({
      cols: 120,
      rows: 40,
      name: "xterm-256color",
      env: {
        COLORTERM: "truecolor",
        TERM: "xterm-256color",
        TERM_PROGRAM: "otterly",
      },
    });
  });

  it("passes through the vault path as cwd when present", () => {
    const options = build_terminal_spawn_options({
      cols: 80,
      rows: 24,
      vault_path: "/tmp/vault",
    });

    expect(options.cwd).toBe("/tmp/vault");
  });
});
