import { invoke } from "@tauri-apps/api/core";
import type { ReadingPositionPort } from "$lib/features/document/ports";

export function create_reading_position_tauri_adapter(): ReadingPositionPort {
  return {
    async get(vault_id, path) {
      return invoke<string | null>("reading_position_get", {
        vaultId: vault_id,
        path,
      });
    },
    async set(vault_id, path, cfi) {
      await invoke<void>("reading_position_set", {
        vaultId: vault_id,
        path,
        cfi,
      });
    },
  };
}
