import type { VaultStore } from "$lib/features/vault";
import type { IweService } from "$lib/features/iwe";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("iwe_lifecycle_reactor");

export function create_iwe_lifecycle_reactor(
  vault_store: VaultStore,
  iwe_service: IweService,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const vault = vault_store.vault;

      if (!vault) {
        void iwe_service.stop();
        return;
      }

      void iwe_service.start().catch((error: unknown) => {
        log.from_error("Failed to start IWE for vault", error);
      });

      return () => {
        void iwe_service.stop().catch((error: unknown) => {
          log.from_error("Failed to stop IWE for vault", error);
        });
      };
    });
  });
}
