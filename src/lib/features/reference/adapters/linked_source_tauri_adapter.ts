import type { LinkedSourcePort } from "../ports";
import type { ScanEntry } from "../types";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import type { VaultId } from "$lib/shared/types/ids";

export function create_linked_source_tauri_adapter(): LinkedSourcePort {
  return {
    async scan_folder(path: string): Promise<ScanEntry[]> {
      return tauri_invoke<ScanEntry[]>("linked_source_scan_folder", {
        folderPath: path,
      });
    },

    async extract_file(path: string): Promise<ScanEntry> {
      return tauri_invoke<ScanEntry>("linked_source_extract_file", {
        filePath: path,
      });
    },

    async list_files(
      path: string,
    ): Promise<{ file_path: string; modified_at: number }[]> {
      return tauri_invoke<{ file_path: string; modified_at: number }[]>(
        "linked_source_list_files",
        { folderPath: path },
      );
    },

    async index_content(
      vault_id: VaultId,
      source_id: string,
      entry: ScanEntry,
    ): Promise<void> {
      await tauri_invoke<void>("linked_source_index_content", {
        vaultId: vault_id,
        sourceId: source_id,
        filePath: entry.file_path,
        title: entry.title ?? entry.file_name,
        body: entry.body_text,
        pageOffsets: entry.page_offsets,
        fileType: entry.file_type,
        modifiedAt: entry.modified_at,
      });
    },

    async remove_content(
      vault_id: VaultId,
      source_id: string,
      file_path: string,
    ): Promise<void> {
      await tauri_invoke<void>("linked_source_remove_content", {
        vaultId: vault_id,
        sourceId: source_id,
        filePath: file_path,
      });
    },

    async clear_source(vault_id: VaultId, source_id: string): Promise<void> {
      await tauri_invoke<void>("linked_source_clear_source", {
        vaultId: vault_id,
        sourceId: source_id,
      });
    },
  };
}
