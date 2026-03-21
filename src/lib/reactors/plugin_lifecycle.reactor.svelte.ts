import type { PluginService } from "$lib/features/plugin";
import type { VaultStore } from "$lib/features/vault";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("plugin_lifecycle_reactor");

export function create_plugin_lifecycle_reactor(
  vault_store: VaultStore,
  plugin_service: PluginService,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const vault = vault_store.vault;

      if (!vault) {
        void plugin_service.clear_active_vault();
        return;
      }

      void plugin_service.initialize_active_vault().catch((error: unknown) => {
        log.from_error("Failed to initialize plugins for vault", error);
      });

      return () => {
        void plugin_service.clear_active_vault().catch((error: unknown) => {
          log.from_error(
            "Failed to clear plugin state for closed vault",
            error,
          );
        });
      };
    });
  });
}
