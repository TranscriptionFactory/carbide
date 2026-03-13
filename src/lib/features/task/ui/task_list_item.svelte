<script lang="ts">
  import type { Task, TaskStatus } from "../types";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import Calendar from "@lucide/svelte/icons/calendar";
  import FileText from "@lucide/svelte/icons/file-text";
  import Hash from "@lucide/svelte/icons/hash";
  import { ACTION_IDS } from "$lib/app/action_registry/action_ids";

  let { task }: { task: Task } = $props();
  const context = use_app_context();
  const taskService = context.services.task;
  const actionRegistry = context.action_registry;

  async function setStatus(status: TaskStatus) {
    await taskService.updateTaskStatus(task.path, task.line_number, status);
  }

  function openNote() {
    actionRegistry.execute(ACTION_IDS.note_open, { note_path: task.path });
  }

  function getStatusIcon(status: TaskStatus) {
    if (status === "done") return "x";
    if (status === "doing") return "-";
    return " ";
  }

  function toggleStatus() {
    if (task.status === "todo") setStatus("doing");
    else if (task.status === "doing") setStatus("done");
    else setStatus("todo");
  }
</script>

<div class="flex items-start gap-3 p-2 hover:bg-muted/50 rounded-md group">
  <div class="mt-0.5">
    <button
      class="h-4 w-4 rounded border border-gray-300 flex items-center justify-center text-[10px] font-bold leading-none bg-background hover:border-interactive transition-colors"
      onclick={toggleStatus}
    >
      {getStatusIcon(task.status)}
    </button>
  </div>

  <div class="flex-1 min-w-0">
    <p
      class="text-sm leading-tight {task.status === 'done'
        ? 'text-muted-foreground line-through'
        : ''}"
    >
      {task.text}
    </p>

    <div
      class="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] text-muted-foreground"
    >
      <button
        class="flex items-center gap-1 hover:text-foreground truncate"
        onclick={openNote}
      >
        <FileText size={10} />
        {task.path.split("/").pop()}
      </button>

      {#if task.section}
        <div class="flex items-center gap-1">
          <Hash size={10} />
          {task.section}
        </div>
      {/if}

      {#if task.due_date}
        <div
          class="flex items-center gap-1 {new Date(task.due_date) <
            new Date() && task.status !== 'done'
            ? 'text-destructive'
            : ''}"
        >
          <Calendar size={10} />
          {task.due_date}
        </div>
      {/if}
    </div>
  </div>
</div>
