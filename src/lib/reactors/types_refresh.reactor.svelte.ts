import type { VaultStore } from "$lib/features/vault";
import type { TypesService } from "$lib/features/types";

export function create_types_refresh_reactor(
  vault_store: VaultStore,
  types_service: TypesService,
) {
  return $effect.root(() => {
    let handle: ReturnType<typeof setTimeout> | undefined;

    $effect(() => {
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;
      if (handle) clearTimeout(handle);
      handle = setTimeout(() => {
        void types_service.refresh(vault_id);
      }, 300);
      return () => {
        if (handle) clearTimeout(handle);
      };
    });
  });
}
