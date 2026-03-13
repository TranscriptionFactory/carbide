<script lang="ts">
  import type { Task } from "../types";
  import TaskListItem from "./task_list_item.svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import CalendarIcon from "@lucide/svelte/icons/calendar";

  let { tasks }: { tasks: Task[] } = $props();

  const groupedByDate = $derived.by(() => {
    const groups = new Map<string, Task[]>();
    
    // Sort tasks with due dates first
    const tasksWithDates = tasks.filter(t => t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
    const tasksWithoutDates = tasks.filter(t => !t.due_date);

    tasksWithDates.forEach(t => {
      const date = t.due_date!;
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date)!.push(t);
    });

    if (tasksWithoutDates.length > 0) {
      groups.set("No Due Date", tasksWithoutDates);
    }

    return Array.from(groups.entries());
  });

  function formatDate(dateStr: string) {
    if (dateStr === "No Due Date") return dateStr;
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  function isOverdue(dateStr: string) {
    if (dateStr === "No Due Date") return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(dateStr) < today;
  }

  function isToday(dateStr: string) {
    if (dateStr === "No Due Date") return false;
    const today = new Date().toISOString().split('T')[0];
    return dateStr === today;
  }
</script>

<div class="h-full overflow-y-auto p-4 flex flex-col gap-6">
  {#if groupedByDate.length === 0}
    <div class="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
      <CalendarIcon size={32} class="opacity-20" />
      <p class="text-sm">No scheduled tasks</p>
    </div>
  {:else}
    {#each groupedByDate as [date, dateTasks] (date)}
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2 border-b pb-1">
          <h3 class="text-xs font-bold {isOverdue(date) ? 'text-destructive' : isToday(date) ? 'text-interactive' : 'text-foreground'}">
            {formatDate(date)}
          </h3>
          {#if isToday(date)}
            <span class="text-[10px] bg-interactive/10 text-interactive px-1.5 py-0.5 rounded-full uppercase font-bold">Today</span>
          {:else if isOverdue(date)}
            <span class="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full uppercase font-bold">Overdue</span>
          {/if}
        </div>
        
        <div class="flex flex-col gap-1 ml-2">
          {#each dateTasks as task (task.id)}
            <TaskListItem {task} />
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</div>
