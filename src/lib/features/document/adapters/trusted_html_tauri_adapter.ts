import { invoke } from "@tauri-apps/api/core";
import type {
  TrustEntry,
  TrustLevel,
  TrustScope,
  TrustedHtmlPort,
} from "$lib/features/document/ports";

export function create_trusted_html_tauri_adapter(): TrustedHtmlPort {
  return {
    async get_level(vault_id, file_path) {
      return invoke<TrustLevel>("trusted_html_get_level", {
        vaultId: vault_id,
        filePath: file_path,
      });
    },
    async list(vault_id) {
      return invoke<TrustEntry[]>("trusted_html_list", {
        vaultId: vault_id,
      });
    },
    async grant(vault_id, path, scope, level) {
      await invoke<void>("trusted_html_grant", {
        vaultId: vault_id,
        path,
        scope,
        level,
      });
    },
    async revoke(vault_id, path, scope) {
      await invoke<void>("trusted_html_revoke", {
        vaultId: vault_id,
        path,
        scope,
      });
    },
    async parent_folder(file_path) {
      return invoke<string>("trusted_html_parent_folder", {
        filePath: file_path,
      });
    },
  };
}
