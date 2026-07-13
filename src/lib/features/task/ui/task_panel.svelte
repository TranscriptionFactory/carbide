<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import TaskListItem from "./task_list_item.svelte";
  import KanbanView from "./kanban_view.svelte";
  import ScheduleView from "./schedule_view.svelte";
  import { onMount, tick } from "svelte";
  import { parse_task_query } from "../parse_task_query";
  import { suggest_task_query } from "../domain/task_query_suggestions";
  import { DslSuggestController } from "$lib/components/ui/dsl_suggest.svelte";
  import DslSuggestDropdown from "$lib/components/ui/dsl_suggest_dropdown.svelte";
  import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
  import { group_tasks } from "../domain/group_tasks";
  import type { FilterExpr, TaskGrouping } from "../types";
  import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
  import ListFilter from "@lucide/svelte/icons/list-filter";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Search from "@lucide/svelte/icons/search";
  import Code from "@lucide/svelte/icons/code";
  import Wrench from "@lucide/svelte/icons/wrench";
  import LayoutList from "@lucide/svelte/icons/layout-list";
  import Kanban from "@lucide/svelte/icons/kanban";
  import Calendar from "@lucide/svelte/icons/calendar";
  import Columns from "@lucide/svelte/icons/columns";
  import Rows from "@lucide/svelte/icons/rows";
  import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import TaskQueryBuilder from "./task_query_builder.svelte";

  const { stores, services, action_registry } = use_app_context();

  let show_builder = $state(false);
  const taskStore = stores.task;
  const taskService = services.task;
  const tagStore = stores.tag;

  let dslTextarea = $state<HTMLTextAreaElement | null>(null);

  const suggest_tags = $derived(tagStore.tags.map((t) => t.tag));

  const suggest = new DslSuggestController({
    provider: suggest_task_query,
    get_ctx: () => ({ tags: suggest_tags }),
    apply: async (from, insert) => {
      const el = dslTextarea;
      if (!el) return;
      const text = taskStore.queryText;
      taskStore.queryText =
        text.slice(0, from) + insert + text.slice(el.selectionStart);
      const cursor = from + insert.length;
      await tick();
      el.setSelectionRange(cursor, cursor);
    },
  });

  function dsl_suggest_update() {
    const el = dslTextarea;
    if (!el) return;
    suggest.update(el.value.slice(0, el.selectionStart));
  }

  function dsl_keydown(e: KeyboardEvent) {
    if (suggest.keydown(e)) return;
  }

  const HIDE_DONE: FilterExpr = {
    type: "atom",
    filter: { property: "status", operator: "neq", value: "done" },
  };

  let showCompleted = $state(false);
  let searchQuery = $state("");
  let queryErrors = $state<string[]>([]);
  let dslGrouping = $state<TaskGrouping>("none");
  let mounted = false;

  const activeGrouping = $derived(
    taskStore.queryMode ? dslGrouping : taskStore.grouping,
  );

  const grouped = $derived(group_tasks(taskStore.tasks, activeGrouping));

  function inject_hide_done(filter: FilterExpr | null): FilterExpr | null {
    if (showCompleted) return filter;
    if (!filter) return HIDE_DONE;
    return { type: "and", operands: [HIDE_DONE, filter] };
  }

  function apply_search(text: string) {
    const trimmed = text.trim();
    const base = taskStore.filter.filter(
      (f) =>
        f.property !== "text" &&
        f.property !== "path" &&
        !(
          f.property === "status" &&
          f.operator === "neq" &&
          f.value === "done"
        ),
    );
    const filters = [...base];
    if (trimmed) {
      filters.push({ property: "text", operator: "contains", value: trimmed });
    }
    if (!showCompleted) {
      filters.push({ property: "status", operator: "neq", value: "done" });
    }
    taskStore.setFilter(filters);
    taskService.refreshTasks();
  }

  function execute_dsl(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      queryErrors = [];
      dslGrouping = "none";
      taskService.queryTasks({ filter: inject_hide_done(null) });
      return;
    }

    const parsed = parse_task_query(trimmed);
    queryErrors = parsed.errors;
    if (parsed.errors.length > 0) return;

    dslGrouping = parsed.grouping;
    taskService.queryTasks({
      ...parsed.query,
      filter: inject_hide_done(parsed.query.filter),
    });
  }

  $effect(() => {
    if (!mounted) return;
    const _sc = showCompleted;
    if (taskStore.queryMode) {
      execute_dsl(taskStore.queryText);
    } else {
      apply_search(searchQuery);
    }
  });

  function toggle_query_mode() {
    taskStore.queryMode = !taskStore.queryMode;
    queryErrors = [];
    if (!taskStore.queryMode) {
      taskStore.queryText = "";
      dslGrouping = "none";
      apply_search(searchQuery);
    }
  }

  onMount(() => {
    mounted = true;
    taskService.refreshTasks();
    void action_registry.execute(ACTION_IDS.tags_refresh);
  });

  function refresh() {
    if (taskStore.queryMode) {
      execute_dsl(taskStore.queryText);
    } else {
      taskService.refreshTasks();
    }
  }

  const groupingOptions = [
    { value: "none", label: "No Grouping" },
    { value: "status", label: "By Status" },
    { value: "note", label: "By Note" },
    { value: "section", label: "By Section" },
  ] as const;

  const sortOptions = [
    { value: "", label: "No Sort" },
    { value: "status", label: "Status" },
    { value: "due_date", label: "Due Date" },
    { value: "path", label: "Path" },
    { value: "text", label: "Text" },
  ] as const;

  let sortProperty = $state("");
  let sortDescending = $state(false);

  function apply_sort(property: string, descending: boolean) {
    if (!property) {
      taskStore.setSort([]);
    } else {
      taskStore.setSort([{ property, descending }]);
    }
    if (!taskStore.queryMode) {
      taskService.refreshTasks();
    }
  }
</script>

<div class="flex flex-col h-full min-w-0 bg-background border-r">
  <div class="p-3 border-b flex flex-col gap-2 min-w-0">
    <div class="flex items-center justify-between min-w-0 gap-2">
      <h2
        class="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2"
      >
        <CheckCircle2 size={14} />
        Tasks
        {#if taskStore.tasks.length > 0}
          <span
            class="text-[10px] font-normal bg-muted px-1.5 py-0.5 rounded-full"
            >{taskStore.tasks.length}</span
          >
        {/if}
      </h2>
      <div class="flex items-center gap-1 flex-wrap">
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

    {#if taskStore.queryMode}
      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-1">
          <Button
            variant="secondary"
            size="icon"
            class="h-8 w-8 shrink-0"
            onclick={toggle_query_mode}
            title="Switch to simple search"
          >
            <Code size={14} />
          </Button>
          <Button
            variant={show_builder ? "secondary" : "ghost"}
            size="icon"
            class="h-8 w-8 shrink-0"
            onclick={() => (show_builder = !show_builder)}
            title="Query builder"
          >
            <Wrench size={14} />
          </Button>
          <div class="relative flex-1">
            <textarea
              bind:this={dslTextarea}
              class="w-full min-h-[60px] max-h-[120px] rounded-md border bg-background px-2 py-1.5 text-xs font-mono resize-y focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="status is todo&#10;due this week&#10;sort by due_date"
              bind:value={taskStore.queryText}
              oninput={dsl_suggest_update}
              onclick={dsl_suggest_update}
              onkeydown={dsl_keydown}
              onblur={() => suggest.close()}
            ></textarea>
            {#if suggest.open}
              <DslSuggestDropdown
                items={suggest.items}
                selected_index={suggest.selected_index}
                on_select={(i) => suggest.accept(i)}
              />
            {/if}
          </div>
        </div>
        {#if show_builder}
          <TaskQueryBuilder
            on_insert={(text) => (taskStore.queryText = text)}
          />
        {/if}
        {#if queryErrors.length > 0}
          <div class="text-[10px] text-destructive px-1">
            {#each queryErrors as err}
              <div>{err}</div>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <div class="flex items-center gap-1">
        <div class="relative flex-1">
          <Search
            class="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground"
          />
          <Input
            placeholder="Search tasks..."
            class="h-8 pl-8 text-xs"
            bind:value={searchQuery}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8 shrink-0"
          onclick={toggle_query_mode}
          title="Switch to query DSL"
        >
          <Code size={14} />
        </Button>
      </div>
    {/if}

    <div class="flex items-center gap-2 justify-between min-w-0 flex-wrap">
      <Button
        variant={showCompleted ? "secondary" : "ghost"}
        size="sm"
        class="h-6 shrink-0 px-2 text-[10px]"
        onclick={() => (showCompleted = !showCompleted)}
      >
        <ListFilter size={10} class="mr-1" />
        {showCompleted ? "Showing All" : "Hide Completed"}
      </Button>

      <div
        class="flex items-center gap-1 text-[10px] text-muted-foreground min-w-0"
      >
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
          <select
            class="min-w-0 bg-transparent border-none focus:ring-0 text-[10px] cursor-pointer"
            value={taskStore.kanbanGroupProperty}
            onchange={(e) =>
              taskStore.setKanbanGroupProperty(e.currentTarget.value)}
          >
            <option value="status">By Status</option>
            <option value="section">By Section</option>
            <option value="note">By Note</option>
          </select>
        {/if}
        {#if !taskStore.queryMode}
          <Columns size={10} />
          <select
            class="min-w-0 bg-transparent border-none focus:ring-0 text-[10px] cursor-pointer"
            value={taskStore.grouping}
            onchange={(e) =>
              taskStore.setGrouping(e.currentTarget.value as any)}
          >
            {#each groupingOptions as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        {/if}
        <ArrowUpDown size={10} />
        <select
          class="min-w-0 bg-transparent border-none focus:ring-0 text-[10px] cursor-pointer"
          value={sortProperty}
          onchange={(e) => {
            sortProperty = e.currentTarget.value;
            apply_sort(sortProperty, sortDescending);
          }}
        >
          {#each sortOptions as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
        {#if sortProperty}
          <Button
            variant="ghost"
            size="icon"
            class="h-4 w-4"
            onclick={() => {
              sortDescending = !sortDescending;
              apply_sort(sortProperty, sortDescending);
            }}
            title={sortDescending ? "Descending" : "Ascending"}
          >
            {#if sortDescending}
              <ArrowDown size={10} />
            {:else}
              <ArrowUp size={10} />
            {/if}
          </Button>
        {/if}
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
    {:else if taskStore.tasks.length === 0}
      <div
        class="flex flex-col items-center justify-center h-40 text-xs text-muted-foreground gap-2"
      >
        <p>No tasks found.</p>
        {#if searchQuery && !taskStore.queryMode}
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
            {#each grouped as group (group.key)}
              {#if group.label}
                <div class="flex items-center gap-2 px-1 pt-2 pb-1 first:pt-0">
                  <span
                    class="text-[10px] font-bold uppercase tracking-tight text-muted-foreground"
                    >{group.label}</span
                  >
                  <span
                    class="text-[10px] bg-muted px-1 py-0.5 rounded-full text-muted-foreground"
                    >{group.tasks.length}</span
                  >
                </div>
              {/if}
              {#each group.tasks as task (task.id)}
                <TaskListItem {task} />
              {/each}
            {/each}
          </div>
        {:else if taskStore.viewMode === "kanban"}
          <KanbanView tasks={taskStore.tasks} />
        {:else if taskStore.viewMode === "schedule"}
          <ScheduleView tasks={taskStore.tasks} />
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
