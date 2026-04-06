import type { FileCache } from "./types";

export interface MetadataPort {
  get_file_cache(vault_id: string, path: string): Promise<FileCache>;
}
