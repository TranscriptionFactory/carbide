import type { TabStore } from "$lib/features/tab";
import type { VaultStore } from "$lib/features/vault";
import type { TabService } from "$lib/features/tab";
import type { VaultId } from "$lib/shared/types/ids";
import { create_persisted_snapshot_controller } from "$lib/reactors/persisted_snapshot";

const TAB_PERSIST_DELAY_MS = 1000;

type PersistedTabSnapshot = {
  tabs: {
    p: string;
    pin: boolean;
  }[];
  active: string | null;
};

export function create_tab_persist_reactor(
  tab_store: TabStore,
  vault_store: VaultStore,
  tab_service: TabService,
): () => void {
  let active_vault_id: VaultId | null = null;
  const persist = create_persisted_snapshot_controller<PersistedTabSnapshot>({
    delay_ms: TAB_PERSIST_DELAY_MS,
    serialize: (snapshot) => JSON.stringify(snapshot),
    save: () => tab_service.save_tabs(),
  });

  function current_snapshot(): PersistedTabSnapshot {
    return {
      tabs: tab_store.tabs.map((t) => ({
        p:
          t.kind === "note"
            ? t.note_path
            : t.kind === "document"
              ? t.file_path
              : t.id,
        pin: t.is_pinned,
      })),
      active: tab_store.active_tab_id,
    };
  }

  function flush_current() {
    if (!active_vault_id) {
      persist.clear_pending();
      return;
    }
    persist.persist_now(current_snapshot(), {
      force: true,
      next_saved_serialized: null,
    });
  }

  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.vault?.id ?? null;
      const _tabs = tab_store.tabs;
      const _active = tab_store.active_tab_id;

      if (vault_id !== active_vault_id) {
        flush_current();
        active_vault_id = vault_id;
        persist.reset_saved();
      }

      if (!vault_id || !vault_store.is_vault_mode) return;
      persist.schedule(current_snapshot());
    });

    return () => {
      flush_current();
    };
  });
}
