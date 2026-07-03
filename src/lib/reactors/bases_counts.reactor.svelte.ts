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

  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.active_vault_id;
      // Track index completions so counts recompute after re-indexing.
      void search_store.index_progress.status;

      if (timer) clearTimeout(timer);

      if (!vault_id) {
        counts_store.clear();
        return;
      }

      timer = setTimeout(() => {
        void bases_service.refresh_counts(vault_id, counts_store);
      }, DEBOUNCE_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
    };
  });
}
