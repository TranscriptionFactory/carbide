import type { VaultStore } from "$lib/features/vault";
import type { ReferenceService } from "$lib/features/reference";

export function create_reference_library_load_reactor(
  vault_store: VaultStore,
  reference_service: ReferenceService,
) {
  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.active_vault_id;
      if (vault_id) {
        void reference_service.load_library();
      }
    });
  });
}
