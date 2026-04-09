import type { LintPort } from "$lib/features/lint/ports";
import type { VaultId, VaultPath } from "$lib/shared/types/ids";
import type {
  LintTextEdit,
  FileDiagnostics,
  LintStatus,
  LintEvent,
} from "$lib/features/lint/types/lint";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { listen } from "@tauri-apps/api/event";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("lint_adapter");

function subscribe_lint_events(
  callback: (event: LintEvent) => void,
): () => void {
  let unlisten_fn: (() => void) | null = null;
  let is_disposed = false;

  void listen<LintEvent>("lint_event", (event) => {
    if (is_disposed) {
      return;
    }
    callback(event.payload);
  })
    .then((fn_ref) => {
      if (is_disposed) {
        try {
          fn_ref();
        } catch {
          // Listener may already have been unregistered
        }
        return;
      }
      unlisten_fn = fn_ref;
    })
    .catch((error: unknown) => {
      log.from_error("Failed to setup lint_event listener", error);
    });

  return () => {
    is_disposed = true;
    if (unlisten_fn) {
      const fn = unlisten_fn;
      unlisten_fn = null;
      try {
        fn();
      } catch {
        // Listener may already have been unregistered
      }
    }
  };
}

export function create_lint_tauri_adapter(): LintPort {
  return {
    async start(
      vault_id: VaultId,
      vault_path: VaultPath,
      user_overrides: string,
      browse_mode: boolean,
    ): Promise<void> {
      await tauri_invoke<undefined>("lint_start", {
        vaultId: vault_id,
        vaultPath: vault_path,
        userOverrides: user_overrides,
        browseMode: browse_mode,
      });
    },
    async stop(vault_id: VaultId): Promise<void> {
      await tauri_invoke<undefined>("lint_stop", { vaultId: vault_id });
    },
    async open_file(
      vault_id: VaultId,
      path: string,
      content: string,
      version: number,
    ): Promise<void> {
      await tauri_invoke<undefined>("lint_open_file", {
        vaultId: vault_id,
        path,
        content,
        version,
      });
    },
    async update_file(
      vault_id: VaultId,
      path: string,
      content: string,
      version: number,
    ): Promise<void> {
      await tauri_invoke<undefined>("lint_update_file", {
        vaultId: vault_id,
        path,
        content,
        version,
      });
    },
    async close_file(vault_id: VaultId, path: string): Promise<void> {
      await tauri_invoke<undefined>("lint_close_file", {
        vaultId: vault_id,
        path,
      });
    },
    async format_file(
      vault_id: VaultId,
      path: string,
      content: string,
      formatter: string,
    ): Promise<LintTextEdit[]> {
      return await tauri_invoke<LintTextEdit[]>("lint_format_file", {
        vaultId: vault_id,
        path,
        content,
        formatter,
      });
    },
    async fix_all(vault_id: VaultId, path: string): Promise<string | null> {
      return await tauri_invoke<string | null>("lint_fix_all", {
        vaultId: vault_id,
        path,
      });
    },
    async check_vault(vault_path: VaultPath): Promise<FileDiagnostics[]> {
      return await tauri_invoke<FileDiagnostics[]>("lint_check_vault", {
        vaultPath: vault_path,
      });
    },
    async format_vault(vault_path: VaultPath): Promise<string[]> {
      return await tauri_invoke<string[]>("lint_format_vault", {
        vaultPath: vault_path,
      });
    },
    async get_status(vault_id: VaultId): Promise<LintStatus> {
      return await tauri_invoke<LintStatus>("lint_get_status", {
        vaultId: vault_id,
      });
    },
    subscribe_events(callback: (event: LintEvent) => void): () => void {
      return subscribe_lint_events(callback);
    },
  };
}
