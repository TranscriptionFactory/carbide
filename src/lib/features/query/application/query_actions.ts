import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { QueryService } from "./query_service";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";

export function register_query_actions(
  registry: ActionRegistry,
  query_service: QueryService,
  ui_store: UIStore,
) {
  registry.register({
    id: ACTION_IDS.query_execute,
    label: "Execute Query",
    execute: async (query_text: unknown) => {
      if (typeof query_text !== "string") return;
      await query_service.execute(query_text);
    },
  });

  registry.register({
    id: ACTION_IDS.query_clear,
    label: "Clear Query",
    execute: () => {
      query_service.clear();
    },
  });

  registry.register({
    id: ACTION_IDS.query_toggle_panel,
    label: "Toggle Query Panel",
    execute: () => {
      if (ui_store.bottom_panel_open && ui_store.bottom_panel_tab === "query") {
        ui_store.bottom_panel_open = false;
      } else {
        ui_store.bottom_panel_tab = "query";
        ui_store.bottom_panel_open = true;
      }
    },
  });

  registry.register({
    id: ACTION_IDS.query_open,
    label: "Query Notes",
    execute: () => {
      ui_store.bottom_panel_tab = "query";
      ui_store.bottom_panel_open = true;
    },
  });
}
