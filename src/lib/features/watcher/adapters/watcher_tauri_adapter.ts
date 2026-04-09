import type { WatcherPort } from "$lib/features/watcher/ports";
import type { VaultId } from "$lib/shared/types/ids";
import type { VaultFsEvent } from "$lib/features/watcher/types/watcher";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { listen } from "@tauri-apps/api/event";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("watcher_adapter");

function subscribe_vault_fs_events(
  callback: (event: VaultFsEvent) => void,
): () => void {
  let unlisten_fn: (() => void) | null = null;
  let is_disposed = false;

  void listen<VaultFsEvent>("vault_fs_event", (event) => {
    if (is_disposed) {
      return;
    }
    callback(event.payload);
  })
    .then((fn_ref) => {
      if (is_disposed) {
        try {
          void Promise.resolve(fn_ref()).catch(() => {});
        } catch {
          // Listener may already have been unregistered
        }
        return;
      }
      unlisten_fn = fn_ref;
    })
    .catch((error: unknown) => {
      log.from_error("Failed to setup vault_fs_event listener", error);
    });

  return () => {
    is_disposed = true;
    if (unlisten_fn) {
      const fn = unlisten_fn;
      unlisten_fn = null;
      try {
        void Promise.resolve(fn()).catch(() => {});
      } catch {
        // Listener may already have been unregistered
      }
    }
  };
}

export function create_watcher_tauri_adapter(): WatcherPort {
  return {
    async watch_vault(vault_id: VaultId): Promise<void> {
      await tauri_invoke<undefined>("watch_vault", {
        vaultId: vault_id,
      });
    },
    async unwatch_vault(): Promise<void> {
      await tauri_invoke<undefined>("unwatch_vault");
    },
    subscribe_fs_events(callback: (event: VaultFsEvent) => void): () => void {
      return subscribe_vault_fs_events(callback);
    },
  };
}
