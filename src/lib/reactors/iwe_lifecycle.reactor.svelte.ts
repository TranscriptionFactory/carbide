import { listen } from "@tauri-apps/api/event";
import type { VaultStore } from "$lib/features/vault";
import type { IweService } from "$lib/features/iwe";
import { is_tauri } from "$lib/shared/utils/detect_platform";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("iwe_lifecycle_reactor");

export function create_iwe_lifecycle_reactor(
  vault_store: VaultStore,
  iwe_service: IweService,
): () => void {
  const cleanup_restart_listener = setup_restart_listener(iwe_service);

  const cleanup_effect = $effect.root(() => {
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

  return () => {
    cleanup_effect();
    cleanup_restart_listener();
  };
}

function setup_restart_listener(iwe_service: IweService): () => void {
  if (!is_tauri) return () => {};

  let unlisten: (() => void) | null = null;
  let cancelled = false;

  void listen("iwe-restart-requested", () => {
    if (cancelled) return;
    log.info("IWE restart requested via CLI");
    void iwe_service.restart().catch((error: unknown) => {
      log.from_error("Failed to restart IWE via CLI", error);
    });
  }).then((fn) => {
    if (cancelled) {
      try {
        fn();
      } catch {
        /* already disposed */
      }
    } else {
      unlisten = fn;
    }
  });

  return () => {
    cancelled = true;
    if (unlisten) {
      const fn = unlisten;
      unlisten = null;
      try {
        fn();
      } catch {
        /* already disposed */
      }
    }
  };
}
