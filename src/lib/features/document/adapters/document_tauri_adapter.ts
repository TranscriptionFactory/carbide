import { invoke } from "@tauri-apps/api/core";
import type { DocumentPort } from "$lib/features/document/ports";
import { carbide_asset_url, carbide_file_asset_url } from "$lib/features/note";

function is_absolute_path(path: string): boolean {
  return path.startsWith("/");
}

export function create_document_tauri_adapter(): DocumentPort {
  return {
    async read_file(vault_id: string, relative_path: string): Promise<string> {
      if (is_absolute_path(relative_path)) {
        return invoke<string>("read_absolute_text_file", {
          path: relative_path,
        });
      }
      return invoke<string>("read_vault_file", {
        vaultId: vault_id,
        relativePath: relative_path,
      });
    },
    async write_file(
      vault_id: string,
      relative_path: string,
      content: string,
    ): Promise<void> {
      return invoke("write_vault_file", {
        vaultId: vault_id,
        relativePath: relative_path,
        content,
      });
    },
    resolve_asset_url(vault_id: string, file_path: string): string {
      if (is_absolute_path(file_path)) {
        return carbide_file_asset_url(file_path);
      }
      return carbide_asset_url(vault_id, file_path);
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
