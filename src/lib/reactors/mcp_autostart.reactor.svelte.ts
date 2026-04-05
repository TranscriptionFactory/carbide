import type { VaultStore } from "$lib/features/vault";
import type { McpService } from "$lib/features/mcp";
import type { UIStore } from "$lib/app";

export function create_mcp_autostart_reactor(
  vault_store: VaultStore,
  ui_store: UIStore,
  mcp_service: McpService,
): () => void {
  let started = false;

  const stop = $effect.root(() => {
    $effect(() => {
      const vault = vault_store.vault;
      const enabled = ui_store.editor_settings.mcp_enabled;
      if (vault && enabled && !started) {
        started = true;
        void mcp_service.start();
      }
      if (!vault || !enabled) {
        if (started) {
          started = false;
          void mcp_service.stop();
        }
      }
    });
  });

  return stop;
}
