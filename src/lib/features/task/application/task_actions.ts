import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { TaskService } from "$lib/features/task/application/task_service";
import type { TaskStore } from "$lib/features/task/state/task_store.svelte";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";

export function register_task_actions(
  registry: ActionRegistry,
  task_service: TaskService,
  task_store: TaskStore,
  ui_store: UIStore,
) {
  registry.register({
    id: ACTION_IDS.task_toggle_panel,
    label: "Tasks: Toggle Panel",
    shortcut: "CmdOrCtrl+Shift+T",
    execute: async () => {
      if (ui_store.sidebar_view === "tasks" && ui_store.sidebar_open) {
        ui_store.sidebar_open = false;
      } else {
        ui_store.sidebar_view = "tasks";
        ui_store.sidebar_open = true;
      }
    },
  });

  registry.register({
    id: ACTION_IDS.task_show_list,
    label: "Tasks: Show List View",
    execute: async () => {
      task_store.setViewMode("list");
    },
  });

  registry.register({
    id: ACTION_IDS.task_show_kanban,
    label: "Tasks: Show Kanban View",
    execute: async () => {
      task_store.setViewMode("kanban");
    },
  });

  registry.register({
    id: ACTION_IDS.task_show_schedule,
    label: "Tasks: Show Schedule View",
    execute: async () => {
      task_store.setViewMode("schedule");
    },
  });

  registry.register({
    id: ACTION_IDS.task_quick_capture,
    label: "Tasks: Quick Capture",
    execute: async () => {
      task_store.showQuickCapture = true;
    },
  });

  registry.register({
    id: ACTION_IDS.task_refresh,
    label: "Tasks: Refresh",
    execute: async () => {
      await task_service.refreshTasks();
    },
  });
}
