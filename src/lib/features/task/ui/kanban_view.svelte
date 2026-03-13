<script lang="ts">
  import type { Task } from "../types";
  import TaskListItem from "./task_list_item.svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";

  let { tasks }: { tasks: Task[] } = $props();
  const { stores } = use_app_context();
  const taskStore = stores.task;

  const columns = $derived.by(() => {
    if (taskStore.grouping === "status" || taskStore.grouping === "none") {
      return [
        { id: "todo", label: "To Do", tasks: tasks.filter(t => !t.completed) },
        { id: "done", label: "Done", tasks: tasks.filter(t => t.completed) }
      ];
    }
    
    if (taskStore.grouping === "section") {
      const groups = new Map<string, Task[]>();
      tasks.forEach(t => {
        const key = t.section || "No Section";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(t);
      });
      return Array.from(groups.entries()).map(([label, tasks]) => ({
        id: label,
        label,
        tasks
      }));
    }

    if (taskStore.grouping === "note") {
      const groups = new Map<string, Task[]>();
      tasks.forEach(t => {
        const key = t.path;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(t);
      });
      return Array.from(groups.entries()).map(([label, tasks]) => ({
        id: label,
        label: label.split('/').pop() || label,
        tasks
      }));
    }

    return [];
  });
</script>

<div class="flex gap-4 h-full overflow-x-auto pb-4 p-2">
  {#each columns as column (column.id)}
    <div class="flex-shrink-0 w-72 flex flex-col bg-muted/30 rounded-lg border">
      <div class="p-3 border-b bg-muted/50 rounded-t-lg flex items-center justify-between">
        <h3 class="text-xs font-bold uppercase tracking-tight text-muted-foreground">
          {column.label}
        </h3>
        <span class="text-[10px] bg-background px-1.5 py-0.5 rounded-full border">
          {column.tasks.length}
        </span>
      </div>
      
      <div class="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {#each column.tasks as task (task.id)}
          <div class="bg-background border rounded-md shadow-sm">
            <TaskListItem {task} />
          </div>
        {/each}
        
        {#if column.tasks.length === 0}
          <div class="flex items-center justify-center h-20 text-[10px] text-muted-foreground italic">
            No tasks
          </div>
        {/if}
      </div>
    </div>
  {/each}
</div>
