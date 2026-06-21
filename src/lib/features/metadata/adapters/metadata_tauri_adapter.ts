import { invoke } from "@tauri-apps/api/core";
import type { MetadataPort } from "../ports";
import type { FileCache, VaultProperty } from "../types";

export class MetadataTauriAdapter implements MetadataPort {
  async get_file_cache(vaultId: string, path: string): Promise<FileCache> {
    return invoke<FileCache>("note_get_file_cache", {
      vaultId,
      notePath: path,
    });
  }

  async list_properties(vaultId: string): Promise<VaultProperty[]> {
    return invoke<VaultProperty[]>("bases_list_properties", { vaultId });
  }
}

export function create_metadata_tauri_adapter(): MetadataPort {
  return new MetadataTauriAdapter();
}
