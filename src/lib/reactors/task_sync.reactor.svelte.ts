import type { VaultStore } from "$lib/features/vault";
import type { TaskService } from "$lib/features/task";
import type { WatcherService } from "$lib/features/watcher";
import type { VaultFsEvent } from "$lib/features/watcher/types/watcher";
import { create_debounced_task_controller } from "$lib/reactors/debounced_task";

const TASK_REFRESH_DEBOUNCE_MS = 500;

export function create_task_sync_reactor(
  vault_store: VaultStore,
  task_service: TaskService,
  watcher_service: WatcherService,
): () => void {
  return $effect.root(() => {
    const task_refresh = create_debounced_task_controller<void>({
      run: () => {
        if (vault_store.is_vault_mode) {
          void task_service.refreshTasks();
        }
      },
    });

    function handle_event(event: VaultFsEvent) {
      if (event.vault_id !== vault_store.vault?.id) return;

      // We refresh tasks when any markdown file changes, is added or removed
      if (
        event.type === "note_changed_externally" ||
        event.type === "note_added" ||
        event.type === "note_removed"
      ) {
        task_refresh.schedule(undefined, TASK_REFRESH_DEBOUNCE_MS);
      }
    }

    $effect(() => {
      const vault = vault_store.vault;
      if (!vault) return;

      const unsub = watcher_service.subscribe(handle_event);

      return () => {
        unsub();
        task_refresh.cancel();
      };
    });
  });
}
