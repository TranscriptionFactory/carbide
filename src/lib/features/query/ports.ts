import type { VaultId } from "$lib/shared/types/ids";
import type { SavedQueryMeta } from "./types";

export interface SavedQueryPort {
  list(vault_id: VaultId): Promise<SavedQueryMeta[]>;
  read(vault_id: VaultId, relative_path: string): Promise<string>;
  write(
    vault_id: VaultId,
    relative_path: string,
    content: string,
  ): Promise<void>;
  remove(vault_id: VaultId, relative_path: string): Promise<void>;
}
