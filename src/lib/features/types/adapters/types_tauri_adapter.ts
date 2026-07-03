import { invoke } from "@tauri-apps/api/core";
import type { VaultId } from "$lib/shared/types/ids";
import type { NoteMeta } from "$lib/shared/types/note";
import type { BaseNoteRow } from "$lib/features/bases";
import { TYPE_DEFINITION_MARKER, type TypesPort } from "../ports";

export function create_types_tauri_adapter(): TypesPort {
  return {
    async list_types(vault_id: VaultId) {
      return invoke("list_types", { vaultId: vault_id });
    },
    async list_definition_notes(vault_id: VaultId): Promise<NoteMeta[]> {
      const results = await invoke<{ rows: BaseNoteRow[] }>("bases_query", {
        vaultId: vault_id,
        query: {
          filters: [
            {
              property: "type",
              operator: "eq",
              value: TYPE_DEFINITION_MARKER,
            },
          ],
          sort: [],
          limit: 500,
          offset: 0,
        },
      });
      return results.rows.map((row) => row.note);
    },
  };
}
