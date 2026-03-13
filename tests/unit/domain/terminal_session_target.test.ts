import { describe, expect, it } from "vitest";
import {
  resolve_terminal_session_policy,
  resolve_terminal_session_target,
} from "$lib/features/terminal";

describe("resolve_terminal_session_policy", () => {
  it("uses follow-active-vault policies when enabled", () => {
    expect(resolve_terminal_session_policy(true)).toEqual({
      cwd_policy: "follow_active_vault",
      respawn_policy: "on_context_change",
    });
  });

  it("uses fixed policies when disabled", () => {
    expect(resolve_terminal_session_policy(false)).toEqual({
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });
  });
});

describe("resolve_terminal_session_target", () => {
  it("uses the followed cwd when follow-active-vault is enabled", () => {
    expect(
      resolve_terminal_session_target({
        follow_active_vault: true,
        followed_cwd: "/vault-b",
        fixed_cwd: "/vault-a",
      }),
    ).toEqual({
      cwd: "/vault-b",
      cwd_policy: "follow_active_vault",
      respawn_policy: "on_context_change",
    });
  });

  it("uses the fixed cwd when follow-active-vault is disabled", () => {
    expect(
      resolve_terminal_session_target({
        follow_active_vault: false,
        followed_cwd: "/vault-b",
        fixed_cwd: "/vault-a",
      }),
    ).toEqual({
      cwd: "/vault-a",
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });
  });
});
