import type { VaultStore } from "$lib/features/vault";
import type { ReferenceService } from "$lib/features/reference";

const RESCAN_DEFER_MS = 3_000;

export function create_reference_library_load_reactor(
  vault_store: VaultStore,
  reference_service: ReferenceService,
) {
  return $effect.root(() => {
    let rescan_timer: ReturnType<typeof setTimeout> | undefined;
    let generation = 0;

    $effect(() => {
      const vault_id = vault_store.active_vault_id;
      const gen = ++generation;

      if (rescan_timer !== undefined) {
        clearTimeout(rescan_timer);
        rescan_timer = undefined;
      }

      if (vault_id) {
        void reference_service.load_library();
        void reference_service.verify_linked_sources().then(() => {
          if (gen !== generation) return;
          rescan_timer = setTimeout(() => {
            void reference_service.rescan_all_enabled_sources();
          }, RESCAN_DEFER_MS);
        });
      }
    });

    return () => {
      generation++;
      if (rescan_timer !== undefined) clearTimeout(rescan_timer);
    };
  });
}
