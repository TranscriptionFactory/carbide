import type { NotesStore } from "$lib/features/note";
import type { VaultStore } from "$lib/features/vault";
import type { VaultService } from "$lib/features/vault";
import type { NoteMeta } from "$lib/shared/types/note";
import type { VaultId } from "$lib/shared/types/ids";
import { create_persisted_snapshot_controller } from "$lib/reactors/persisted_snapshot";

const RECENT_NOTES_PERSIST_DELAY_MS = 1000;

type RecentNotesSnapshot = {
  vault_id: VaultId;
  recent_notes: NoteMeta[];
};

export function create_recent_notes_persist_reactor(
  notes_store: NotesStore,
  vault_store: VaultStore,
  vault_service: VaultService,
): () => void {
  let active_vault_id = vault_store.vault?.id ?? null;
  const persist = create_persisted_snapshot_controller<RecentNotesSnapshot>({
    delay_ms: RECENT_NOTES_PERSIST_DELAY_MS,
    serialize: ({ recent_notes }) => JSON.stringify(recent_notes),
    save: ({ vault_id, recent_notes }) =>
      vault_service.save_recent_notes(vault_id, recent_notes),
  });

  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.vault?.id ?? null;
      const recent_notes = notes_store.recent_notes;

      if (vault_id !== active_vault_id) {
        persist.flush_pending();
        active_vault_id = vault_id;
        persist.reset_saved();
      }

      if (!vault_id || !vault_store.is_vault_mode) return;
      persist.schedule({
        vault_id,
        recent_notes,
      });
    });

    return () => {
      persist.flush_pending();
    };
  });
}
