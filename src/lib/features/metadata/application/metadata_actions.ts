import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { MetadataService } from "./metadata_service";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";

export function register_metadata_actions(
  registry: ActionRegistry,
  metadata_service: MetadataService,
  ui_store: UIStore,
) {
  registry.register({
    id: ACTION_IDS.metadata_refresh,
    label: "Refresh Metadata",
    execute: async (path: unknown) => {
      if (typeof path !== "string") return;
      await metadata_service.refresh(path);
    },
  });

  registry.register({
    id: ACTION_IDS.metadata_toggle_panel,
    label: "Toggle Metadata Panel",
    execute: () => {
      if (
        ui_store.context_rail_open &&
        ui_store.context_rail_tab === "metadata"
      ) {
        ui_store.close_context_rail("metadata");
      } else {
        ui_store.set_context_rail_tab("metadata");
      }
    },
  });
}
