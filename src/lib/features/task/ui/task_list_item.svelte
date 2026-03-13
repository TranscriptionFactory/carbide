<script lang="ts">
  import type { Task } from "../types";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import Calendar from "@lucide/svelte/icons/calendar";
  import FileText from "@lucide/svelte/icons/file-text";
  import Hash from "@lucide/svelte/icons/hash";

  let { task }: { task: Task } = $props();
  const context = use_app_context();
  const taskService = context.services.task;
  const actionRegistry = context.action_registry;

  async function toggle() {
    await taskService.toggleTask(task.path, task.line_number, !task.completed);
  }

  function openNote() {
    actionRegistry.execute("note_open", { path: task.path });
  }
</script>

<div class="flex items-start gap-3 p-2 hover:bg-muted/50 rounded-md group">
  <div class="mt-0.5">
    <input 
      type="checkbox" 
      checked={task.completed} 
      onchange={toggle} 
      class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
    />
  </div>
  
  <div class="flex-1 min-w-0">
    <p class="text-sm leading-tight {task.completed ? 'text-muted-foreground line-through' : ''}">
      {task.text}
    </p>
    
    <div class="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] text-muted-foreground">
      <button 
        class="flex items-center gap-1 hover:text-foreground truncate"
        onclick={openNote}
      >
        <FileText size={10} />
        {task.path.split('/').pop()}
      </button>
      
      {#if task.section}
        <div class="flex items-center gap-1">
          <Hash size={10} />
          {task.section}
        </div>
      {/if}
      
      {#if task.due_date}
        <div class="flex items-center gap-1 {new Date(task.due_date) < new Date() && !task.completed ? 'text-destructive' : ''}">
          <Calendar size={10} />
          {task.due_date}
        </div>
      {/if}
    </div>
  </div>
</div>
