import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { BasesService } from "./bases_service";
import type { BasesStore } from "../state/bases_store.svelte";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { VaultStore } from "$lib/features/vault";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

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

  registry.register({
    id: ACTION_IDS.bases_save_view,
    label: "Save Base View",
    execute: async (...args: unknown[]) => {
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;

      const name =
        typeof args[0] === "string" ? args[0] : bases_store.active_view_name;
      if (!name) return;

      const path = `.carbide/bases/${slugify(name)}.json`;
      await bases_service.save_view(vault_id, path, name);
      bases_store.active_view_name = name;
      await bases_service.list_views(vault_id);
    },
  });

  registry.register({
    id: ACTION_IDS.bases_load_view,
    label: "Load Base View",
    execute: async (...args: unknown[]) => {
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;

      const path = typeof args[0] === "string" ? args[0] : null;
      if (!path) return;

      await bases_service.load_view(vault_id, path);
    },
  });

  registry.register({
    id: ACTION_IDS.bases_list_views,
    label: "List Saved Base Views",
    execute: async () => {
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;
      await bases_service.list_views(vault_id);
    },
  });

  registry.register({
    id: ACTION_IDS.bases_delete_view,
    label: "Delete Base View",
    execute: async (...args: unknown[]) => {
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;

      const path = typeof args[0] === "string" ? args[0] : null;
      if (!path) return;

      await bases_service.delete_view(vault_id, path);
    },
  });
}
