import { invoke } from "@tauri-apps/api/core";
import type { MetadataPort } from "../ports";
import type { FileCache } from "../types";

export class MetadataTauriAdapter implements MetadataPort {
  async get_file_cache(vaultId: string, path: string): Promise<FileCache> {
    return invoke<FileCache>("note_get_file_cache", {
      vaultId,
      notePath: path,
    });
  }
}
