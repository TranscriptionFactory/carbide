import type { SplitViewStore } from "$lib/features/split_view";
import type { SplitViewService } from "$lib/features/split_view";
import type { VaultStore } from "$lib/features/vault";
import type { VaultId } from "$lib/shared/types/ids";
import { create_persisted_snapshot_controller } from "$lib/reactors/persisted_snapshot";

const PERSIST_DELAY_MS = 1000;

type PersistedSplitViewSnapshot = {
  active: boolean;
  note_path: string | null;
};

export function create_split_view_persist_reactor(
  split_view_store: SplitViewStore,
  vault_store: VaultStore,
  split_view_service: SplitViewService,
): () => void {
  let active_vault_id: VaultId | null = null;
  const persist =
    create_persisted_snapshot_controller<PersistedSplitViewSnapshot>({
      delay_ms: PERSIST_DELAY_MS,
      serialize: (snapshot) => JSON.stringify(snapshot),
      save: () => split_view_service.save_split_state(),
    });

  function current_snapshot(): PersistedSplitViewSnapshot {
    return {
      active: split_view_store.active,
      note_path: split_view_store.secondary_note?.meta.path ?? null,
    };
  }

  function flush_pending() {
    if (!persist.has_pending()) {
      persist.clear_pending();
      return;
    }
    if (!active_vault_id) {
      persist.clear_pending();
      return;
    }
    persist.flush_pending({
      next_saved_serialized: null,
    });
  }

  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.vault?.id ?? null;
      const _active = split_view_store.active;
      const _note = split_view_store.secondary_note;

      if (vault_id !== active_vault_id) {
        flush_pending();
        active_vault_id = vault_id;
        persist.reset_saved();
      }

      if (!vault_id || !vault_store.is_vault_mode) return;
      persist.schedule(current_snapshot());
    });

    return () => {
      flush_pending();
    };
  });
}
