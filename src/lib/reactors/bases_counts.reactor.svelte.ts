import type { VaultStore } from "$lib/features/vault";
import type { SearchStore } from "$lib/features/search";
import type { BasesService, BaseCountsStore } from "$lib/features/bases";

const DEBOUNCE_MS = 400;

export function create_bases_counts_reactor(
  vault_store: VaultStore,
  search_store: SearchStore,
  bases_service: BasesService,
  counts_store: BaseCountsStore,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last_vault_id: string | null = null;
  let last_completed = false;

  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.active_vault_id;
      const completed = search_store.index_progress.status === "completed";
      const vault_changed = vault_id !== last_vault_id;
      const just_completed = completed && !last_completed;
      last_vault_id = vault_id;
      last_completed = completed;

      if (!vault_id) {
        if (timer) clearTimeout(timer);
        counts_store.clear();
        return;
      }
      // Only a vault switch or an index completion can change the counts;
      // idle → indexing transitions and progress events must not re-list.
      if (!vault_changed && !just_completed) return;

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void bases_service.refresh_counts(vault_id, counts_store);
      }, DEBOUNCE_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
    };
  });
}
