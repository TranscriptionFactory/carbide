import type { FileCache, VaultProperty } from "./types";

export interface MetadataPort {
  get_file_cache(vault_id: string, path: string): Promise<FileCache>;
  list_properties(vault_id: string): Promise<VaultProperty[]>;
}
