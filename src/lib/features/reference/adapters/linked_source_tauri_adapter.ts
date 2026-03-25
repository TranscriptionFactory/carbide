import type { LinkedSourcePort } from "../ports";
import type { ScanEntry, LinkedSourceFsEvent } from "../types";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { listen } from "@tauri-apps/api/event";
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

    async watch(path: string): Promise<void> {
      await tauri_invoke<void>("linked_source_watch", {
        folderPath: path,
      });
    },

    async unwatch(path: string): Promise<void> {
      await tauri_invoke<void>("linked_source_unwatch", {
        folderPath: path,
      });
    },

    async unwatch_all(): Promise<void> {
      await tauri_invoke<void>("linked_source_unwatch_all", {});
    },

    subscribe_events(
      callback: (event: LinkedSourceFsEvent) => void,
    ): () => void {
      let unlisten_fn: (() => void) | null = null;
      let is_disposed = false;

      void listen<LinkedSourceFsEvent>("linked-source-fs-event", (event) => {
        if (is_disposed) return;
        callback(event.payload);
      })
        .then((fn_ref) => {
          if (is_disposed) {
            try {
              void Promise.resolve(fn_ref()).catch(() => {});
            } catch {
              // already unregistered
            }
            return;
          }
          unlisten_fn = fn_ref;
        })
        .catch((error: unknown) => {
          console.error("Failed to subscribe linked source events:", error);
        });

      return () => {
        is_disposed = true;
        if (unlisten_fn) {
          try {
            unlisten_fn();
          } catch {
            // already unregistered
          }
          unlisten_fn = null;
        }
      };
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
