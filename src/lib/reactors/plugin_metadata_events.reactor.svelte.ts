import type { PluginService } from "$lib/features/plugin";
import type { VaultStore } from "$lib/features/vault";
import { listen } from "@tauri-apps/api/event";

interface MetadataChangedPayload {
  event_type: "upsert" | "rename" | "delete";
  vault_id: string;
  path: string;
  old_path?: string;
}

export function create_plugin_metadata_events_reactor(
  vault_store: VaultStore,
  plugin_service: PluginService,
): () => void {
  let unlisten_fn: (() => void) | null = null;
  let is_disposed = false;

  void listen<MetadataChangedPayload>("metadata-changed", (event) => {
    if (is_disposed) return;
    const payload = event.payload;
    if (payload.vault_id !== vault_store.vault?.id) return;

    plugin_service.emit_plugin_event("metadata-changed", {
      event_type: payload.event_type,
      path: payload.path,
      old_path: payload.old_path,
    });
  }).then((fn) => {
    if (is_disposed) {
      fn();
    } else {
      unlisten_fn = fn;
    }
  });

  return () => {
    is_disposed = true;
    if (unlisten_fn) {
      unlisten_fn();
      unlisten_fn = null;
    }
  };
}
