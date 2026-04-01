import type { LinkedSourcePort } from "../ports";
import type { ScanEntry, LinkedSourceMeta, LinkedNoteInfo } from "../types";
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
      source_name: string,
      entry: ScanEntry,
      linked_meta: LinkedSourceMeta,
    ): Promise<void> {
      await tauri_invoke<void>("linked_source_index_content", {
        vaultId: vault_id,
        sourceId: source_id,
        sourceName: source_name,
        filePath: entry.file_path,
        title: entry.title ?? entry.file_name,
        body: entry.body_text,
        pageOffsets: entry.page_offsets,
        fileType: entry.file_type,
        modifiedAt: entry.modified_at,
        linkedMeta: linked_meta,
      });
    },

    async remove_content(
      vault_id: VaultId,
      source_name: string,
      file_path: string,
    ): Promise<void> {
      await tauri_invoke<void>("linked_source_remove_content", {
        vaultId: vault_id,
        sourceName: source_name,
        filePath: file_path,
      });
    },

    async clear_source(vault_id: VaultId, source_name: string): Promise<void> {
      await tauri_invoke<void>("linked_source_clear_source", {
        vaultId: vault_id,
        sourceName: source_name,
      });
    },

    async query_linked_notes(
      vault_id: VaultId,
      source_name: string,
    ): Promise<LinkedNoteInfo[]> {
      return tauri_invoke<LinkedNoteInfo[]>("query_linked_notes_by_source", {
        vaultId: vault_id,
        sourceName: source_name,
      });
    },

    async count_linked_notes(
      vault_id: VaultId,
      source_name: string,
    ): Promise<number> {
      return tauri_invoke<number>("count_linked_notes_by_source", {
        vaultId: vault_id,
        sourceName: source_name,
      });
    },

    async find_by_citekey(
      vault_id: VaultId,
      citekey: string,
    ): Promise<LinkedNoteInfo | null> {
      return tauri_invoke<LinkedNoteInfo | null>("find_note_by_citekey", {
        vaultId: vault_id,
        citekey,
      });
    },

    async search_linked_notes(
      vault_id: VaultId,
      query: string,
      limit?: number,
    ): Promise<LinkedNoteInfo[]> {
      return tauri_invoke<LinkedNoteInfo[]>("search_linked_notes", {
        vaultId: vault_id,
        query,
        limit: limit ?? 50,
      });
    },

    async update_linked_metadata(
      vault_id: VaultId,
      source_name: string,
      external_file_path: string,
      linked_meta: LinkedSourceMeta,
    ): Promise<boolean> {
      return tauri_invoke<boolean>("update_linked_note_metadata", {
        vaultId: vault_id,
        sourceName: source_name,
        externalFilePath: external_file_path,
        linkedMeta: linked_meta,
      });
    },
  };
}
