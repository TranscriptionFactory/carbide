import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { TaskListService } from "./task_list_service";
import type { VaultStore } from "$lib/features/vault";

export function register_task_list_actions(
  registry: ActionRegistry,
  task_list_service: TaskListService,
  vault_store: VaultStore,
) {
  registry.register({
    id: ACTION_IDS.task_list_create,
    label: "Create Task List",
    execute: async (...args: unknown[]) => {
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;
      const name = typeof args[0] === "string" ? args[0] : null;
      if (!name) return;
      await task_list_service.create_list(vault_id, name);
    },
  });

  registry.register({
    id: ACTION_IDS.task_list_delete,
    label: "Delete Task List",
    execute: async (...args: unknown[]) => {
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;
      const name = typeof args[0] === "string" ? args[0] : null;
      if (!name) return;
      await task_list_service.delete_list(vault_id, name);
    },
  });

  registry.register({
    id: ACTION_IDS.task_list_add_item,
    label: "Add Task List Item",
    execute: async (...args: unknown[]) => {
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;
      const list_name = typeof args[0] === "string" ? args[0] : null;
      const text = typeof args[1] === "string" ? args[1] : null;
      if (!list_name || !text) return;
      await task_list_service.add_item(vault_id, list_name, text);
    },
  });

  registry.register({
    id: ACTION_IDS.task_list_toggle_item,
    label: "Toggle Task List Item",
    execute: async (...args: unknown[]) => {
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;
      const list_name = typeof args[0] === "string" ? args[0] : null;
      const item_id = typeof args[1] === "string" ? args[1] : null;
      if (!list_name || !item_id) return;
      await task_list_service.toggle_item(vault_id, list_name, item_id);
    },
  });

  registry.register({
    id: ACTION_IDS.task_list_load_available,
    label: "Load Available Task Lists",
    execute: async () => {
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;
      await task_list_service.load_available(vault_id);
    },
  });
}
