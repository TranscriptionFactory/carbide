import type { ReferenceStoragePort } from "../ports";
import type { CslItem, ReferenceLibrary } from "../types";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";

export function create_reference_tauri_adapter(): ReferenceStoragePort {
  return {
    async load_library(vault_id: string): Promise<ReferenceLibrary> {
      return tauri_invoke<ReferenceLibrary>("reference_load_library", {
        vaultId: vault_id,
      });
    },

    async save_library(
      vault_id: string,
      library: ReferenceLibrary,
    ): Promise<void> {
      await tauri_invoke<void>("reference_save_library", {
        vaultId: vault_id,
        library,
      });
    },

    async add_item(vault_id: string, item: CslItem): Promise<ReferenceLibrary> {
      return tauri_invoke<ReferenceLibrary>("reference_add_item", {
        vaultId: vault_id,
        item,
      });
    },

    async remove_item(
      vault_id: string,
      citekey: string,
    ): Promise<ReferenceLibrary> {
      return tauri_invoke<ReferenceLibrary>("reference_remove_item", {
        vaultId: vault_id,
        citekey,
      });
    },
  };
}
