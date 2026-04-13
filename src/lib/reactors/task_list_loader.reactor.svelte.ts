import type { VaultStore } from "$lib/features/vault";
import type { TaskListService } from "$lib/features/task_list";

export function create_task_list_loader_reactor(
  vault_store: VaultStore,
  task_list_service: TaskListService,
) {
  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.active_vault_id;
      if (vault_id) {
        void task_list_service.load_available(vault_id);
      }
    });
  });
}
