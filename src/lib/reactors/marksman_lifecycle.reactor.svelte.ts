import { listen } from "@tauri-apps/api/event";
import type { VaultStore } from "$lib/features/vault";
import type { MarksmanService } from "$lib/features/marksman";
import type { UIStore } from "$lib/app";
import { is_tauri } from "$lib/shared/utils/detect_platform";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("marksman_lifecycle_reactor");

export function create_marksman_lifecycle_reactor(
  vault_store: VaultStore,
  marksman_service: MarksmanService,
  ui_store: UIStore,
): () => void {
  const cleanup_restart_listener = setup_restart_listener(marksman_service);

  const cleanup_effect = $effect.root(() => {
    $effect(() => {
      const vault = vault_store.vault;
      const enabled = ui_store.editor_settings.marksman_enabled;
      const provider = ui_store.editor_settings.markdown_lsp_provider;
      const custom_path = ui_store.editor_settings.marksman_binary_path;

      if (!vault || !enabled) {
        void marksman_service.stop();
        return;
      }

      void marksman_service
        .start(provider, custom_path || undefined)
        .catch((error: unknown) => {
          log.from_error("Failed to start markdown LSP for vault", error);
        });

      return () => {
        void marksman_service.stop().catch((error: unknown) => {
          log.from_error("Failed to stop Marksman for vault", error);
        });
      };
    });
  });

  return () => {
    cleanup_effect();
    cleanup_restart_listener();
  };
}

function setup_restart_listener(marksman_service: MarksmanService): () => void {
  if (!is_tauri) return () => {};

  let unlisten: (() => void) | null = null;
  let cancelled = false;

  void listen("marksman-restart-requested", () => {
    if (cancelled) return;
    log.info("Marksman restart requested via CLI");
    void marksman_service.restart().catch((error: unknown) => {
      log.from_error("Failed to restart Marksman via CLI", error);
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
