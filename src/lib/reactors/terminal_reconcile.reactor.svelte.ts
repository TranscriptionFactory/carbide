import type { UIStore } from "$lib/app";
import type {
  TerminalService,
  TerminalSessionMeta,
  TerminalSessionReconcileInput,
  TerminalStore,
} from "$lib/features/terminal";
import type { VaultStore } from "$lib/features/vault";

export type TerminalReconcileTarget = TerminalSessionReconcileInput & {
  session_id: string;
};

export function resolve_terminal_reconcile_targets(input: {
  session_ids: string[];
  sessions: Map<string, TerminalSessionMeta>;
  shell_path: string;
  vault_path: string | undefined;
  follow_active_vault: boolean;
}): TerminalReconcileTarget[] {
  const cwd_policy = input.follow_active_vault
    ? "follow_active_vault"
    : "fixed";
  const respawn_policy = input.follow_active_vault
    ? "on_context_change"
    : "manual";

  return input.session_ids.flatMap((session_id) => {
    const session = input.sessions.get(session_id);
    if (!session) {
      return [];
    }

    const cwd =
      cwd_policy === "follow_active_vault"
        ? input.vault_path
        : (session.cwd ?? undefined);
    const next_cwd = cwd ?? null;
    const already_aligned =
      session.shell_path === input.shell_path &&
      session.cwd === next_cwd &&
      session.cwd_policy === cwd_policy &&
      session.respawn_policy === respawn_policy;

    if (already_aligned) {
      return [];
    }

    return [
      {
        session_id,
        shell_path: input.shell_path,
        cwd,
        cwd_policy,
        respawn_policy,
      },
    ];
  });
}

export function create_terminal_reconcile_reactor(
  terminal_store: TerminalStore,
  ui_store: UIStore,
  vault_store: VaultStore,
  terminal_service: TerminalService,
): () => void {
  const pending_reconciliations = new Map<string, string>();

  return $effect.root(() => {
    $effect(() => {
      const targets = resolve_terminal_reconcile_targets({
        session_ids: terminal_store.session_ids,
        sessions: terminal_store.sessions,
        shell_path: ui_store.editor_settings.terminal_shell_path || "/bin/zsh",
        vault_path: vault_store.vault?.path ?? undefined,
        follow_active_vault:
          ui_store.editor_settings.terminal_follow_active_vault,
      });

      for (const target of targets) {
        const signature = [
          target.shell_path,
          target.cwd ?? "",
          target.cwd_policy,
          target.respawn_policy,
        ].join("|");

        if (pending_reconciliations.get(target.session_id) === signature) {
          continue;
        }

        pending_reconciliations.set(target.session_id, signature);
        void terminal_service
          .reconcile_session(target.session_id, target)
          .finally(() => {
            if (pending_reconciliations.get(target.session_id) === signature) {
              pending_reconciliations.delete(target.session_id);
            }
          });
      }

      const session_ids = new Set(terminal_store.session_ids);
      for (const session_id of pending_reconciliations.keys()) {
        if (!session_ids.has(session_id)) {
          pending_reconciliations.delete(session_id);
        }
      }
    });

    return () => {
      pending_reconciliations.clear();
    };
  });
}
