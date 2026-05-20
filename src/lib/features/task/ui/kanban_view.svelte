<script module lang="ts">
  import type { Task, TaskGrouping, TaskStatus } from "../types";
  import { group_tasks } from "../domain/group_tasks";

  const STATUS_ORDER: TaskStatus[] = ["todo", "doing", "done"];
  const STATUS_LABELS: Record<string, string> = {
    todo: "To Do",
    doing: "Doing",
    done: "Done",
  };

  export function derive_kanban_columns(tasks: Task[], groupProperty: string) {
    if (groupProperty === "status") {
      const groups = group_tasks(tasks, "status");
      const by_key = new Map(groups.map((g) => [g.key, g]));
      return STATUS_ORDER.map((s) => ({
        id: s,
        label: STATUS_LABELS[s] ?? s,
        status: s as TaskStatus | undefined,
        tasks: by_key.get(s)?.tasks ?? [],
      }));
    }

    const KNOWN: Set<string> = new Set(["note", "section", "due_date"]);
    if (!KNOWN.has(groupProperty)) return [] as { id: string; label: string; status: TaskStatus | undefined; tasks: Task[] }[];
    const groups = group_tasks(tasks, groupProperty as TaskGrouping);
    return groups.map((g) => ({
      id: g.key,
      label: g.label,
      status: undefined as TaskStatus | undefined,
      tasks: g.tasks,
    }));
  }
</script>

<script lang="ts">
  import TaskListItem from "./task_list_item.svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { create_logger } from "$lib/shared/utils/logger";

  const log = create_logger("kanban_view");

  let { tasks }: { tasks: Task[] } = $props();
  const { stores, services } = use_app_context();
  const taskStore = stores.task;
  const taskService = services.task;

  const columns = $derived(
    derive_kanban_columns(tasks, taskStore.kanbanGroupProperty),
  );

  function handleDragStart(event: DragEvent, task: Task) {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData("application/json", JSON.stringify(task));
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  async function handleDrop(
    event: DragEvent,
    targetStatus: TaskStatus | undefined,
  ) {
    event.preventDefault();
    if (!targetStatus || !event.dataTransfer) return;

    try {
      const taskData = event.dataTransfer.getData("application/json");
      if (!taskData) return;

      const task = JSON.parse(taskData) as Task;
      if (task.status === targetStatus) return;

      await taskService.updateTaskStatus(
        task.path,
        task.line_number,
        targetStatus,
      );
    } catch (e) {
      log.from_error("Failed to drop task:", e);
    }
  }
</script>

<div
  class="flex {taskStore.kanbanOrientation === 'horizontal'
    ? 'flex-row overflow-x-auto h-full pb-4'
    : 'flex-col overflow-y-auto h-full pr-4'} gap-4 p-2"
>
  {#each columns as column (column.id)}
    <div
      class="flex-shrink-0 {taskStore.kanbanOrientation === 'horizontal'
        ? 'w-72 flex flex-col'
        : 'w-full flex flex-col'} bg-muted/30 rounded-lg border"
      role="list"
      ondragover={handleDragOver}
      ondrop={(e) => handleDrop(e, column.status)}
    >
      <div
        class="p-3 border-b bg-muted/50 rounded-t-lg flex items-center justify-between"
      >
        <h3
          class="text-xs font-bold uppercase tracking-tight text-muted-foreground"
        >
          {column.label}
        </h3>
        <span
          class="text-[10px] bg-background px-1.5 py-0.5 rounded-full border"
        >
          {column.tasks.length}
        </span>
      </div>

      <div
        class="flex-1 {taskStore.kanbanOrientation === 'horizontal'
          ? 'overflow-y-auto'
          : ''} p-2 flex flex-col gap-2"
      >
        {#each column.tasks as task (task.id)}
          <div
            class="bg-background border rounded-md shadow-sm cursor-grab active:cursor-grabbing"
            role="listitem"
            draggable="true"
            ondragstart={(e) => handleDragStart(e, task)}
          >
            <TaskListItem {task} />
          </div>
        {/each}

        {#if column.tasks.length === 0}
          <div
            class="flex items-center justify-center h-20 text-[10px] text-muted-foreground italic"
          >
            No tasks
          </div>
        {/if}
      </div>
    </div>
  {/each}
</div>
