import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { BasesService } from "./bases_service";
import type { BasesStore } from "../state/bases_store.svelte";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { VaultStore } from "$lib/features/vault";

export function register_bases_actions(
  registry: ActionRegistry,
  bases_service: BasesService,
  bases_store: BasesStore,
  vault_store: VaultStore,
  ui_store: UIStore,
) {
  registry.register({
    id: ACTION_IDS.bases_toggle_panel,
    label: "Toggle Bases Panel",
    execute: () => {
      if (ui_store.sidebar_open && ui_store.sidebar_view === "bases") {
        ui_store.toggle_sidebar();
      } else {
        ui_store.set_sidebar_view("bases");
      }
    },
  });

  registry.register({
    id: ACTION_IDS.bases_refresh,
    label: "Refresh Bases",
    execute: async () => {
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;
      await bases_service.refresh_properties(vault_id);
      await bases_service.run_query(vault_id);
    },
  });
}
