import type { VaultStore } from "$lib/features/vault";
import type { ToolchainService } from "$lib/features/toolchain";

export function create_toolchain_lifecycle_reactor(
  vault_store: VaultStore,
  toolchain_service: ToolchainService,
): () => void {
  let loaded = false;

  const stop = $effect.root(() => {
    $effect(() => {
      const vault = vault_store.vault;
      if (vault && !loaded) {
        loaded = true;
        void toolchain_service.load();
      }
      if (!vault) {
        loaded = false;
      }
    });
  });

  return stop;
}
