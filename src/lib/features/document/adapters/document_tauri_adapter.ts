import { invoke } from "@tauri-apps/api/core";
import type { DocumentPort } from "$lib/features/document/ports";
import { carbide_asset_url } from "$lib/features/note";

export function create_document_tauri_adapter(): DocumentPort {
  return {
    async read_file(vault_id: string, relative_path: string): Promise<string> {
      return invoke<string>("read_vault_file", {
        vaultId: vault_id,
        relativePath: relative_path,
      });
    },
    resolve_asset_url(vault_id: string, relative_path: string): string {
      return carbide_asset_url(vault_id, relative_path);
    },
    async open_buffer(
      id: string,
      vault_id: string,
      relative_path: string,
    ): Promise<number> {
      return invoke<number>("open_buffer", {
        id,
        vaultId: vault_id,
        relativePath: relative_path,
      });
    },
    async read_buffer_window(
      id: string,
      start_line: number,
      end_line: number,
    ): Promise<string> {
      return invoke<string>("read_buffer_window", {
        id,
        startLine: start_line,
        endLine: end_line,
      });
    },
    async close_buffer(id: string): Promise<void> {
      return invoke("close_buffer", { id });
    },
  };
}
