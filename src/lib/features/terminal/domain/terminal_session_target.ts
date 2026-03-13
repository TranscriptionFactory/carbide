import type {
  TerminalCwdPolicy,
  TerminalRespawnPolicy,
} from "$lib/features/terminal/state/terminal_store.svelte";

export type TerminalSessionTarget = {
  cwd: string | undefined;
  cwd_policy: TerminalCwdPolicy;
  respawn_policy: TerminalRespawnPolicy;
};

export function resolve_terminal_session_policy(follow_active_vault: boolean): {
  cwd_policy: TerminalCwdPolicy;
  respawn_policy: TerminalRespawnPolicy;
} {
  return {
    cwd_policy: follow_active_vault ? "follow_active_vault" : "fixed",
    respawn_policy: follow_active_vault ? "on_context_change" : "manual",
  };
}

export function resolve_terminal_session_target(input: {
  follow_active_vault: boolean;
  followed_cwd: string | undefined;
  fixed_cwd: string | undefined;
}): TerminalSessionTarget {
  const policy = resolve_terminal_session_policy(input.follow_active_vault);

  return {
    cwd: input.follow_active_vault ? input.followed_cwd : input.fixed_cwd,
    ...policy,
  };
}
