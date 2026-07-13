<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
  import QueryBuilder from "$lib/features/query/ui/query_builder.svelte";
  import TaskQueryBuilder from "$lib/features/task/ui/task_query_builder.svelte";

  const { stores, action_registry } = use_app_context();

  let target = $state<"notes" | "tasks">("notes");

  function handle_open_change(open: boolean) {
    stores.ui.query_builder_open = open;
  }

  async function insert_notes(text: string) {
    await action_registry.execute(ACTION_IDS.query_open);
    await action_registry.execute(ACTION_IDS.query_execute, text);
    stores.ui.query_builder_open = false;
  }

  function insert_tasks(text: string) {
    stores.ui.set_context_rail_tab("tasks");
    stores.task.queryMode = true;
    stores.task.queryText = text;
    stores.ui.query_builder_open = false;
  }
</script>

<Dialog.Root
  open={stores.ui.query_builder_open}
  onOpenChange={handle_open_change}
>
  <Dialog.Content class="max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Build query</Dialog.Title>
      <Dialog.Description>
        Compose a query visually, then insert it into the matching panel.
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex gap-1">
      <Button
        variant={target === "notes" ? "secondary" : "ghost"}
        size="sm"
        class="flex-1"
        onclick={() => (target = "notes")}
      >
        Notes query
      </Button>
      <Button
        variant={target === "tasks" ? "secondary" : "ghost"}
        size="sm"
        class="flex-1"
        onclick={() => (target = "tasks")}
      >
        Task query
      </Button>
    </div>

    {#if target === "notes"}
      <QueryBuilder on_insert={insert_notes} />
    {:else}
      <TaskQueryBuilder on_insert={insert_tasks} />
    {/if}
  </Dialog.Content>
</Dialog.Root>
