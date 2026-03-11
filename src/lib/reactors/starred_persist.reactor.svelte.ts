import type { NotesStore } from "$lib/features/note";
import type { VaultStore } from "$lib/features/vault";
import type { VaultService } from "$lib/features/vault";
import type { VaultId } from "$lib/shared/types/ids";
import { create_persisted_snapshot_controller } from "$lib/reactors/persisted_snapshot";

const STARRED_PATHS_PERSIST_DELAY_MS = 400;

type StarredPathsSnapshot = {
  vault_id: VaultId;
  starred_paths: string[];
};

export function create_starred_persist_reactor(
  notes_store: NotesStore,
  vault_store: VaultStore,
  vault_service: VaultService,
) {
  let active_vault_id = vault_store.vault?.id ?? null;
  const persist = create_persisted_snapshot_controller<StarredPathsSnapshot>({
    delay_ms: STARRED_PATHS_PERSIST_DELAY_MS,
    serialize: ({ starred_paths }) => JSON.stringify(starred_paths),
    save: ({ vault_id, starred_paths }) =>
      vault_service.save_starred_paths(vault_id, starred_paths),
  });

  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.vault?.id ?? null;
      const starred_paths = notes_store.starred_paths;

      if (vault_id !== active_vault_id) {
        persist.flush_pending();
        active_vault_id = vault_id;
        persist.reset_saved();
      }

      if (!vault_id || !vault_store.is_vault_mode) {
        return;
      }
      persist.schedule({
        vault_id,
        starred_paths,
      });
    });

    return () => {
      persist.flush_pending();
    };
  });
}
