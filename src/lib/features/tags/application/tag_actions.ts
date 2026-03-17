import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { TagService } from "./tag_service";
import type { TagStore } from "../state/tag_store.svelte";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";

export function register_tag_actions(
  registry: ActionRegistry,
  tag_service: TagService,
  tag_store: TagStore,
  ui_store: UIStore,
) {
  registry.register({
    id: ACTION_IDS.tags_refresh,
    label: "Refresh Tags",
    execute: async () => {
      await tag_service.refresh_tags();
    },
  });

  registry.register({
    id: ACTION_IDS.tags_select,
    label: "Select Tag",
    execute: async (tag: unknown) => {
      if (tag === null || tag === undefined) {
        tag_service.deselect_tag();
        return;
      }
      if (typeof tag !== "string") return;
      await tag_service.select_tag(tag);
    },
  });

  registry.register({
    id: ACTION_IDS.tags_open_note,
    label: "Open Note from Tags",
    execute: async (note_path: unknown) => {
      await registry.execute(ACTION_IDS.note_open, note_path);
    },
  });

  registry.register({
    id: ACTION_IDS.tags_set_search_query,
    label: "Set Tags Search Query",
    execute: (query: unknown) => {
      if (typeof query !== "string") return;
      tag_store.set_search_query(query);
    },
  });

  registry.register({
    id: ACTION_IDS.tags_toggle_panel,
    label: "Toggle Tags Panel",
    execute: () => {
      if (ui_store.sidebar_open && ui_store.sidebar_view === "tags") {
        ui_store.toggle_sidebar();
      } else {
        ui_store.set_sidebar_view("tags");
      }
    },
  });
}
