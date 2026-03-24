import type { VaultStore } from "$lib/features/vault";
import type { ReferenceService } from "$lib/features/reference";

export function create_linked_source_sync_reactor(
  vault_store: VaultStore,
  reference_service: ReferenceService,
) {
  return $effect.root(() => {
    $effect(() => {
      const vault = vault_store.vault;
      if (vault) {
        void (async () => {
          await reference_service.load_linked_sources();
          await reference_service.start_linked_source_watchers();

          // Initial scan for all enabled sources
          const sources = reference_service.get_linked_sources_snapshot();
          for (const source of sources) {
            if (source.enabled) {
              void reference_service.scan_linked_source(source.id);
            }
          }
        })();
      } else {
        void reference_service.stop_linked_source_watchers();
      }
    });
  });
}
