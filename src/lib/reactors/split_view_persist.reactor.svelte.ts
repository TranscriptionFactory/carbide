import type { SplitViewStore } from "$lib/features/split_view";
import type { SplitViewService } from "$lib/features/split_view";
import type { VaultStore } from "$lib/features/vault";
import type { VaultId } from "$lib/shared/types/ids";

const PERSIST_DELAY_MS = 1000;

export function create_split_view_persist_reactor(
  split_view_store: SplitViewStore,
  vault_store: VaultStore,
  split_view_service: SplitViewService,
): () => void {
  let active_vault_id: VaultId | null = null;
  let last_saved_serialized: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule_persist() {
    const serialized = JSON.stringify({
      active: split_view_store.active,
      note_path: split_view_store.secondary_note?.meta.path ?? null,
    });
    if (serialized === last_saved_serialized) return;

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      void split_view_service.save_split_state().then(() => {
        last_saved_serialized = serialized;
      });
    }, PERSIST_DELAY_MS);
  }

  function flush_pending() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    } else {
      return;
    }
    if (!active_vault_id) return;
    void split_view_service.save_split_state().then(() => {
      last_saved_serialized = null;
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
        last_saved_serialized = null;
      }

      if (!vault_id || !vault_store.is_vault_mode) return;
      schedule_persist();
    });

    return () => {
      flush_pending();
    };
  });
}
