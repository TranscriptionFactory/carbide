<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import TaskListItem from "./task_list_item.svelte";
  import KanbanView from "./kanban_view.svelte";
  import ScheduleView from "./schedule_view.svelte";
  import { onMount } from "svelte";
  import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
  import ListFilter from "@lucide/svelte/icons/list-filter";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Search from "@lucide/svelte/icons/search";
  import LayoutList from "@lucide/svelte/icons/layout-list";
  import Kanban from "@lucide/svelte/icons/kanban";
  import Calendar from "@lucide/svelte/icons/calendar";
  import Columns from "@lucide/svelte/icons/columns";
  import Rows from "@lucide/svelte/icons/rows";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { ACTION_IDS } from "$lib/app";

  const { stores, services, action_registry } = use_app_context();
  const taskStore = stores.task;
  const taskService = services.task;

  let searchQuery = $state("");
  let showCompleted = $state(false);

  const filteredTasks = $derived(
    taskStore.tasks.filter((task) => {
      const matchesSearch =
        task.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.path.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCompleted = showCompleted || task.status !== "done";
      return matchesSearch && matchesCompleted;
    }),
  );

  onMount(() => {
    taskService.refreshTasks();
  });

  function refresh() {
    taskService.refreshTasks();
  }

  const groupingOptions = [
    { value: "none", label: "No Grouping" },
    { value: "status", label: "By Status" },
    { value: "note", label: "By Note" },
    { value: "section", label: "By Section" },
  ] as const;
</script>

<div class="flex flex-col h-full bg-background border-r">
  <div class="p-3 border-b flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <h2
        class="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2"
      >
        <CheckCircle2 size={14} />
        Tasks
      </h2>
      <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          class="h-6 w-6 {taskStore.viewMode === 'list'
            ? 'bg-muted text-interactive'
            : ''}"
          onclick={() => taskStore.setViewMode("list")}
          title="List View"
        >
          <LayoutList size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-6 w-6 {taskStore.viewMode === 'kanban'
            ? 'bg-muted text-interactive'
            : ''}"
          onclick={() => taskStore.setViewMode("kanban")}
          title="Kanban View"
        >
          <Kanban size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-6 w-6 {taskStore.viewMode === 'schedule'
            ? 'bg-muted text-interactive'
            : ''}"
          onclick={() => taskStore.setViewMode("schedule")}
          title="Schedule View"
        >
          <Calendar size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          onclick={refresh}
          disabled={taskStore.loading}
        >
          <RefreshCw
            size={14}
            class={taskStore.loading ? "animate-spin" : ""}
          />
        </Button>
      </div>
    </div>

    <div class="relative">
      <Search
        class="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground"
      />
      <Input
        placeholder="Search tasks..."
        class="h-8 pl-8 text-xs"
        bind:value={searchQuery}
      />
    </div>

    <div class="flex items-center gap-2 justify-between">
      <Button
        variant={showCompleted ? "secondary" : "ghost"}
        size="sm"
        class="h-6 px-2 text-[10px]"
        onclick={() => (showCompleted = !showCompleted)}
      >
        <ListFilter size={10} class="mr-1" />
        {showCompleted ? "Showing All" : "Hide Completed"}
      </Button>

      <div class="flex items-center gap-1 text-[10px] text-muted-foreground">
        {#if taskStore.viewMode === "kanban"}
          <Button
            variant="ghost"
            size="icon"
            class="h-5 w-5"
            onclick={() =>
              taskStore.setKanbanOrientation(
                taskStore.kanbanOrientation === "horizontal"
                  ? "vertical"
                  : "horizontal",
              )}
            title="Toggle Orientation ({taskStore.kanbanOrientation})"
          >
            {#if taskStore.kanbanOrientation === "horizontal"}
              <Rows size={10} />
            {:else}
              <Columns size={10} />
            {/if}
          </Button>
          <div class="w-px h-3 bg-border mx-1"></div>
        {/if}
        <Columns size={10} />
        <select
          class="bg-transparent border-none focus:ring-0 text-[10px] cursor-pointer"
          value={taskStore.grouping}
          onchange={(e) => taskStore.setGrouping(e.currentTarget.value as any)}
        >
          {#each groupingOptions as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>

  <div class="flex-1 overflow-hidden">
    {#if taskStore.loading && taskStore.tasks.length === 0}
      <div
        class="flex items-center justify-center h-20 text-xs text-muted-foreground"
      >
        Loading tasks...
      </div>
    {:else if filteredTasks.length === 0}
      <div
        class="flex flex-col items-center justify-center h-40 text-xs text-muted-foreground gap-2"
      >
        <p>No tasks found.</p>
        {#if searchQuery}
          <Button
            variant="link"
            size="sm"
            class="h-auto p-0 text-[10px]"
            onclick={() => (searchQuery = "")}
          >
            Clear search
          </Button>
        {/if}
      </div>
    {:else}
      <div class="h-full">
        {#if taskStore.viewMode === "list"}
          <div class="h-full overflow-y-auto p-2 flex flex-col gap-1">
            {#each filteredTasks as task (task.id)}
              <TaskListItem {task} />
            {/each}
          </div>
        {:else if taskStore.viewMode === "kanban"}
          <KanbanView tasks={filteredTasks} />
        {:else if taskStore.viewMode === "schedule"}
          <ScheduleView tasks={filteredTasks} />
        {/if}
      </div>
    {/if}
  </div>

  {#if taskStore.error}
    <div class="p-2 bg-destructive/10 text-destructive text-[10px] border-t">
      {taskStore.error}
    </div>
  {/if}
</div>
