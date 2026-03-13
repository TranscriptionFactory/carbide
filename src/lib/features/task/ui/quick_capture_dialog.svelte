<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
  import Calendar from "@lucide/svelte/icons/calendar";
  import FileText from "@lucide/svelte/icons/file-text";

  let {
    open,
    on_open_change,
  }: { open: boolean; on_open_change: (open: boolean) => void } = $props();
  const { stores, services } = use_app_context();
  const taskService = services.task;

  let text = $state("");
  let targetPath = $state(stores.editor.open_note?.meta.path || "Inbox.md");
  let dueDate = $state("");

  $effect(() => {
    if (open) {
      targetPath = stores.editor.open_note?.meta.path || "Inbox.md";
    }
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!text.trim()) return;

    let taskText = text.trim();
    if (dueDate) {
      taskText += ` @${dueDate}`;
    }

    await taskService.createTask(targetPath, taskText);
    text = "";
    dueDate = "";
    on_open_change(false);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      void handleSubmit(e);
    }
  }
</script>

<Dialog.Root {open} onOpenChange={on_open_change}>
  <Dialog.Content class="sm:max-w-[425px]">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <CheckCircle2 size={18} class="text-interactive" />
        Quick Task Capture
      </Dialog.Title>
      <Dialog.Description>
        Add a new task to your vault quickly.
      </Dialog.Description>
    </Dialog.Header>

    <form onsubmit={handleSubmit} class="grid gap-4 py-4">
      <div class="grid gap-2">
        <Input
          placeholder="What needs to be done?"
          bind:value={text}
          onkeydown={handleKeydown}
          autofocus
        />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="grid gap-2">
          <label
            for="target"
            class="text-xs font-medium flex items-center gap-1.5 text-muted-foreground"
          >
            <FileText size={12} />
            Target Note
          </label>
          <Input
            id="target"
            placeholder="Inbox.md"
            bind:value={targetPath}
            class="h-8 text-xs"
          />
        </div>
        <div class="grid gap-2">
          <label
            for="due"
            class="text-xs font-medium flex items-center gap-1.5 text-muted-foreground"
          >
            <Calendar size={12} />
            Due Date
          </label>
          <Input
            id="due"
            type="date"
            bind:value={dueDate}
            class="h-8 text-xs"
          />
        </div>
      </div>

      <Dialog.Footer>
        <Button
          type="button"
          variant="ghost"
          onclick={() => on_open_change(false)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!text.trim()}>Add Task</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
