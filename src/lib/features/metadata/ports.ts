import type { FileCache, VaultProperty } from "./types";

export interface MetadataPort {
  get_file_cache(vault_id: string, path: string): Promise<FileCache>;
  list_properties(vault_id: string): Promise<VaultProperty[]>;
  update_property(
    vault_id: string,
    note_path: string,
    key: string,
    value: string,
  ): Promise<void>;
}
