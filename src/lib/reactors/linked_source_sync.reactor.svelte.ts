import type { VaultStore } from "$lib/features/vault";
import type { ReferenceService } from "$lib/features/reference";
import type { SearchStore } from "$lib/features/search";

export function create_linked_source_sync_reactor(
  vault_store: VaultStore,
  reference_service: ReferenceService,
  search_store: SearchStore,
) {
  return $effect.root(() => {
    let initial_scan_done = false;

    $effect(() => {
      const vault = vault_store.vault;
      if (vault) {
        void (async () => {
          await reference_service.load_linked_sources();
          await reference_service.start_linked_source_watchers();
        })();
      } else {
        initial_scan_done = false;
        void reference_service.stop_linked_source_watchers();
      }
    });

    // Defer initial scan until vault indexing completes
    $effect(() => {
      const vault = vault_store.vault;
      const status = search_store.index_progress.status;
      if (!vault || initial_scan_done) return;
      if (status !== "completed") return;

      initial_scan_done = true;
      const sources = reference_service.get_linked_sources_snapshot();
      void (async () => {
        for (const source of sources) {
          if (source.enabled) {
            await reference_service.scan_linked_source(source.id);
          }
        }
      })();
    });
  });
}
