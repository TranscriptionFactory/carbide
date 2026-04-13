<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import type { TaskListItem, TaskListItemStatus } from "../types";
  import { onMount } from "svelte";
  import ListChecks from "@lucide/svelte/icons/list-checks";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";

  let { list_name }: { list_name: string } = $props();

  const { stores, services } = use_app_context();
  const task_list_store = stores.task_list;
  const task_list_service = services.task_list;
  const vault_store = stores.vault;

  let new_item_text = $state("");
  let adding = $state(false);

  const list = $derived(task_list_store.lists.get(list_name));
  const items = $derived(list?.items ?? []);

  onMount(() => {
    const vault_id = vault_store.active_vault_id;
    if (vault_id && !task_list_store.lists.has(list_name)) {
      task_list_service.load_list(vault_id, list_name);
    }
  });

  function toggle(item: TaskListItem) {
    const vault_id = vault_store.active_vault_id;
    if (!vault_id) return;
    task_list_service.toggle_item(vault_id, list_name, item.id);
  }

  function add_item() {
    const text = new_item_text.trim();
    if (!text) return;
    const vault_id = vault_store.active_vault_id;
    if (!vault_id) return;
    task_list_service.add_item(vault_id, list_name, text);
    new_item_text = "";
  }

  function remove_item(item_id: string) {
    const vault_id = vault_store.active_vault_id;
    if (!vault_id) return;
    task_list_service.remove_item(vault_id, list_name, item_id);
  }

  function status_icon(status: TaskListItemStatus): string {
    if (status === "done") return "x";
    if (status === "doing") return "-";
    return " ";
  }

  function handle_keydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      add_item();
    }
  }
</script>

<div
  class="task-list-embed border rounded-md my-2 bg-background"
  contenteditable="false"
>
  <div
    class="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 rounded-t-md"
  >
    <ListChecks size={14} class="text-muted-foreground shrink-0" />
    <span class="text-xs font-medium truncate">{list_name}</span>
    <span class="text-[10px] text-muted-foreground ml-auto shrink-0">
      {items.filter((i) => i.status === "done").length}/{items.length}
    </span>
  </div>

  {#if !list}
    <div class="px-3 py-4 text-xs text-muted-foreground text-center">
      Task list "{list_name}" not found.
    </div>
  {:else}
    <div class="px-1 py-1">
      {#each items as item (item.id)}
        <div
          class="flex items-center gap-2 px-2 py-1 hover:bg-muted/50 rounded group"
        >
          <button
            class="h-4 w-4 rounded border border-gray-300 flex items-center justify-center text-[10px] font-bold leading-none bg-background hover:border-interactive transition-colors shrink-0"
            onclick={() => toggle(item)}
          >
            {status_icon(item.status)}
          </button>
          <span
            class="flex-1 text-xs min-w-0 truncate {item.status === 'done'
              ? 'text-muted-foreground line-through'
              : ''}"
          >
            {item.text}
          </span>
          <button
            class="h-4 w-4 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
            onclick={() => remove_item(item.id)}
          >
            <Trash2 size={12} />
          </button>
        </div>
      {/each}
    </div>

    <div class="px-2 pb-2">
      {#if adding}
        <div class="flex items-center gap-1">
          <input
            type="text"
            class="flex-1 h-7 px-2 text-xs border rounded bg-background focus:outline-none focus:ring-1 focus:ring-interactive"
            placeholder="New task..."
            bind:value={new_item_text}
            onkeydown={handle_keydown}
            onblur={() => {
              if (!new_item_text.trim()) adding = false;
            }}
          />
        </div>
      {:else}
        <button
          class="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          onclick={() => (adding = true)}
        >
          <Plus size={12} />
          Add task
        </button>
      {/if}
    </div>
  {/if}
</div>
