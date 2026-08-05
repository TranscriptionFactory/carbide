import type { PluginService } from "$lib/features/plugin";
import type { VaultStore } from "$lib/features/vault";
import { subscribe_metadata_changed } from "$lib/reactors/metadata_changed";

export function create_plugin_metadata_events_reactor(
  vault_store: VaultStore,
  plugin_service: PluginService,
): () => void {
  return subscribe_metadata_changed((payload) => {
    if (payload.vault_id !== vault_store.vault?.id) return;

    plugin_service.emit_plugin_event("metadata-changed", {
      event_type: payload.event_type,
      path: payload.path,
      old_path: payload.old_path,
    });
  });
}
