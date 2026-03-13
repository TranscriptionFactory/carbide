<script lang="ts">
  import type { Task, TaskStatus } from "../types";
  import TaskListItem from "./task_list_item.svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";

  let { tasks }: { tasks: Task[] } = $props();
  const { stores, services } = use_app_context();
  const taskStore = stores.task;
  const taskService = services.task;

  const columns = $derived.by(() => {
    if (taskStore.grouping === "status" || taskStore.grouping === "none") {
      return [
        {
          id: "todo",
          label: "To Do",
          status: "todo" as TaskStatus,
          tasks: tasks.filter((t) => t.status === "todo"),
        },
        {
          id: "doing",
          label: "Doing",
          status: "doing" as TaskStatus,
          tasks: tasks.filter((t) => t.status === "doing"),
        },
        {
          id: "done",
          label: "Done",
          status: "done" as TaskStatus,
          tasks: tasks.filter((t) => t.status === "done"),
        },
      ];
    }

    if (taskStore.grouping === "section") {
      const groups = new Map<string, Task[]>();
      tasks.forEach((t) => {
        const key = t.section || "No Section";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(t);
      });
      return Array.from(groups.entries()).map(([label, tasks]) => ({
        id: label,
        label,
        status: undefined,
        tasks,
      }));
    }

    if (taskStore.grouping === "note") {
      const groups = new Map<string, Task[]>();
      tasks.forEach((t) => {
        const key = t.path;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(t);
      });
      return Array.from(groups.entries()).map(([label, tasks]) => ({
        id: label,
        label: label.split("/").pop() || label,
        status: undefined,
        tasks,
      }));
    }

    return [];
  });

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
      console.error("Failed to drop task:", e);
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
