import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { MetadataService } from "./metadata_service";
import type { MetadataStore } from "../state/metadata_store.svelte";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";

export function register_metadata_actions(
  registry: ActionRegistry,
  metadata_service: MetadataService,
  metadata_store: MetadataStore,
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

  registry.register({
    id: ACTION_IDS.metadata_add_property,
    label: "Add Metadata Property",
    execute: (key: unknown, value: unknown) => {
      if (typeof key !== "string" || typeof value !== "string") return;
      metadata_store.add_property(key, value);
    },
  });

  registry.register({
    id: ACTION_IDS.metadata_update_property,
    label: "Update Metadata Property",
    execute: (key: unknown, value: unknown) => {
      if (typeof key !== "string" || typeof value !== "string") return;
      metadata_store.update_property(key, value);
    },
  });

  registry.register({
    id: ACTION_IDS.metadata_delete_property,
    label: "Delete Metadata Property",
    execute: (key: unknown) => {
      if (typeof key !== "string") return;
      metadata_store.remove_property(key);
    },
  });
}
