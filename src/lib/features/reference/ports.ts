import type { ReferenceLibrary, CslItem } from "./types";

export interface ReferenceStoragePort {
  load_library(vault_id: string): Promise<ReferenceLibrary>;
  save_library(vault_id: string, library: ReferenceLibrary): Promise<void>;
  add_item(vault_id: string, item: CslItem): Promise<ReferenceLibrary>;
  remove_item(vault_id: string, citekey: string): Promise<ReferenceLibrary>;
}
