import { invoke } from "@tauri-apps/api/core";
import type { SavedQueryPort } from "$lib/features/query/ports";
import type { SavedQueryMeta } from "$lib/features/query/types";

type FileMeta = {
  path: string;
  name: string;
  extension: string;
  size_bytes: number;
  mtime_ms: number;
};

export function create_saved_query_tauri_adapter(): SavedQueryPort {
  return {
    async list(vault_id: string): Promise<SavedQueryMeta[]> {
      const files = await invoke<FileMeta[]>("list_vault_files_by_extension", {
        vaultId: vault_id,
        extension: "query",
      });
      return files.map((f) => ({
        path: f.path,
        name: f.name,
        mtime_ms: f.mtime_ms,
        size_bytes: f.size_bytes,
      }));
    },

    async read(vault_id: string, relative_path: string): Promise<string> {
      return invoke<string>("read_vault_file", {
        vaultId: vault_id,
        relativePath: relative_path,
      });
    },

    async write(
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

    async remove(vault_id: string, relative_path: string): Promise<void> {
      return invoke("delete_vault_file", {
        vaultId: vault_id,
        relativePath: relative_path,
      });
    },
  };
}
