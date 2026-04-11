import type { StoragePort } from "$lib/features/settings/ports";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";

export function create_storage_tauri_adapter(): StoragePort {
  return {
    async get_storage_stats() {
      return tauri_invoke("get_storage_stats");
    },

    async cleanup_orphaned_dbs() {
      return tauri_invoke("cleanup_orphaned_dbs");
    },

    async clear_embedding_model_cache() {
      return tauri_invoke("clear_embedding_model_cache");
    },

    async purge_all_asset_caches() {
      return tauri_invoke("purge_all_asset_caches");
    },
  };
}
