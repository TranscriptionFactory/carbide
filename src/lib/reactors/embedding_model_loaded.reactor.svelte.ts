import { listen } from "@tauri-apps/api/event";
import { is_tauri } from "$lib/shared/utils/detect_platform";
import { create_logger } from "$lib/shared/utils/logger";
import type { VaultStore } from "$lib/features/vault";
import type { WorkspaceIndexPort } from "$lib/features/search";

const log = create_logger("embedding_model_loaded_reactor");

export function create_embedding_model_loaded_reactor(
  vault_store: VaultStore,
  workspace_index_port: WorkspaceIndexPort,
): () => void {
  if (!is_tauri) {
    return () => {};
  }

  let unlisten: (() => void) | null = null;
  let cancelled = false;

  void listen<null>("embedding_model_loaded", () => {
    if (cancelled) return;
    const vault_id = vault_store.vault?.id ?? null;
    if (!vault_id) return;
    void workspace_index_port.embed_sync(vault_id).catch((error: unknown) => {
      log.error("Embedding sync after model load failed", { error });
    });
  }).then((fn) => {
    if (cancelled) {
      try {
        void Promise.resolve(fn()).catch(() => {});
      } catch {
        // Listener may already have been unregistered
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
        void Promise.resolve(fn()).catch(() => {});
      } catch {
        // Listener may already have been unregistered
      }
    }
  };
}
