import type { UIStore } from "$lib/app";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app";

/**
 * Syncs graph and task panel positions based on settings.
 */
export function create_panel_positions_reactor(
  ui_store: UIStore,
  action_registry: ActionRegistry,
) {
  return $effect.root(() => {
    // Sync Graph Position
    $effect(() => {
      const side = ui_store.editor_settings.graph_panel_side;
      
      if (side === "left") {
        // If currently in rail, move to sidebar
        if (ui_store.context_rail_open && ui_store.context_rail_tab === "graph") {
          ui_store.close_context_rail("graph");
          void action_registry.execute(ACTION_IDS.ui_set_sidebar_view, "graph");
        }
      } else {
        // If currently in sidebar, move to rail
        if (ui_store.sidebar_open && ui_store.sidebar_view === "graph") {
          void action_registry.execute(ACTION_IDS.ui_set_sidebar_view, "explorer");
          ui_store.set_context_rail_tab("graph");
        }
      }
    });

    // Sync Tasks Position
    $effect(() => {
      const side = ui_store.editor_settings.tasks_panel_side;
      
      if (side === "left") {
        // If currently in rail, move to sidebar
        if (ui_store.context_rail_open && ui_store.context_rail_tab === "tasks") {
          ui_store.close_context_rail("tasks");
          void action_registry.execute(ACTION_IDS.ui_set_sidebar_view, "tasks");
        }
      } else {
        // If currently in sidebar, move to rail
        if (ui_store.sidebar_open && ui_store.sidebar_view === "tasks") {
          void action_registry.execute(ACTION_IDS.ui_set_sidebar_view, "explorer");
          ui_store.set_context_rail_tab("tasks");
        }
      }
    });
  });
}
