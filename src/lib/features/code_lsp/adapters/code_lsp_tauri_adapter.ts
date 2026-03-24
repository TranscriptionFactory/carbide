import type { CodeLspPort } from "$lib/features/code_lsp/ports";
import type { VaultId, VaultPath } from "$lib/shared/types/ids";
import type {
  CodeLspEvent,
  CodeLspStatus,
} from "$lib/features/code_lsp/types/code_lsp";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { listen } from "@tauri-apps/api/event";

function subscribe_code_lsp_events(
  callback: (event: CodeLspEvent) => void,
): () => void {
  let unlisten_fn: (() => void) | null = null;
  let is_disposed = false;

  void listen<CodeLspEvent>("code_lsp_event", (event) => {
    if (is_disposed) return;
    callback(event.payload);
  }).then((fn_ref) => {
    if (is_disposed) {
      try {
        fn_ref();
      } catch {
        /* already unregistered */
      }
    } else {
      unlisten_fn = fn_ref;
    }
  });

  return () => {
    is_disposed = true;
    if (unlisten_fn) {
      try {
        unlisten_fn();
      } catch {
        /* already unregistered */
      }
    }
  };
}

export function create_code_lsp_tauri_adapter(): CodeLspPort {
  return {
    async open_file(
      vault_id: VaultId,
      vault_path: VaultPath,
      path: string,
      content: string,
    ): Promise<void> {
      await tauri_invoke("code_lsp_open_file", {
        vaultId: vault_id,
        vaultPath: vault_path,
        path,
        content,
      });
    },

    async close_file(vault_id: VaultId, path: string): Promise<void> {
      await tauri_invoke("code_lsp_close_file", {
        vaultId: vault_id,
        path,
      });
    },

    async stop_vault(vault_id: VaultId): Promise<void> {
      await tauri_invoke("code_lsp_stop_vault", {
        vaultId: vault_id,
      });
    },

    async available_languages(vault_id: VaultId): Promise<string[]> {
      return tauri_invoke<string[]>("code_lsp_available_languages", {
        vaultId: vault_id,
      });
    },

    async get_status(
      vault_id: VaultId,
      language: string,
    ): Promise<CodeLspStatus> {
      return tauri_invoke<CodeLspStatus>("code_lsp_get_status", {
        vaultId: vault_id,
        language,
      });
    },

    subscribe_events: subscribe_code_lsp_events,
  };
}
