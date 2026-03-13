import type { VaultStore } from "$lib/features/vault";
import type { BasesService } from "$lib/features/bases";

export function create_bases_refresh_reactor(
  vault_store: VaultStore,
  bases_service: BasesService,
) {
  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.active_vault_id;
      if (vault_id) {
        void bases_service.refresh_properties(vault_id);
        void bases_service.run_query(vault_id);
      }
    });
  });
}
