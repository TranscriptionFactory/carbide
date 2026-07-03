import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { VaultStore } from "$lib/features/vault";
import type { BasesService, BasesStore } from "$lib/features/bases";
import type { TypesService } from "./types_service";
import type { TypesStore } from "../state/types_store.svelte";

export function register_types_actions(
  registry: ActionRegistry,
  types_service: TypesService,
  types_store: TypesStore,
  bases_service: BasesService,
  bases_store: BasesStore,
  vault_store: VaultStore,
  ui_store: UIStore,
) {
  registry.register({
    id: ACTION_IDS.types_refresh,
    label: "Refresh Types",
    execute: async () => {
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;
      await types_service.refresh(vault_id);
    },
  });

  registry.register({
    id: ACTION_IDS.types_create,
    label: "Create Type",
    execute: async (...args: unknown[]) => {
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;
      const name = typeof args[0] === "string" ? args[0] : null;
      if (!name) return;
      await types_service.create(vault_id, name);
    },
  });

  registry.register({
    id: ACTION_IDS.types_set_icon_color,
    label: "Set Type Icon and Color",
    execute: async (...args: unknown[]) => {
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;
      const [path, icon, color] = args as [string, string?, string?];
      if (!path) return;
      if (icon !== undefined)
        await types_service.set_property(vault_id, path, "icon", icon);
      if (color !== undefined)
        await types_service.set_property(vault_id, path, "color", color);
    },
  });

  registry.register({
    id: ACTION_IDS.types_set_visibility,
    label: "Set Type Visibility",
    execute: async (...args: unknown[]) => {
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;
      const [path, visible] = args as [string, boolean];
      if (!path) return;
      await types_service.set_property(vault_id, path, "visible", visible);
    },
  });

  registry.register({
    id: ACTION_IDS.types_reorder,
    label: "Reorder Type",
    execute: async (...args: unknown[]) => {
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;
      const [path, order] = args as [string, number];
      if (!path) return;
      await types_service.set_property(vault_id, path, "order", order);
    },
  });

  registry.register({
    id: ACTION_IDS.types_rename,
    label: "Rename Type",
    execute: async (...args: unknown[]) => {
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;
      const [path, label] = args as [string, string];
      if (!path || !label) return;
      await types_service.set_property(vault_id, path, "label", label);
    },
  });

  registry.register({
    id: ACTION_IDS.types_select,
    label: "Select Type",
    execute: async (...args: unknown[]) => {
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;
      const name = typeof args[0] === "string" ? args[0] : null;
      if (!name) return;

      types_store.active_type = name;
      bases_store.query = {
        filters: [{ property: "type", operator: "eq", value: name }],
        sort: [],
        limit: 100,
        offset: 0,
      };
      bases_store.active_view_name = name;
      ui_store.set_sidebar_view("bases");
      await bases_service.run_query(vault_id);
    },
  });
}
