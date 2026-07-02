<script lang="ts">
  import type { BaseNoteRow, KanbanConfig, PropertyInfo } from "../ports";
  import {
    group_rows_by_property,
    type KanbanColumn,
  } from "../domain/kanban_grouping";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";

  let {
    rows,
    config,
    available_properties,
    on_note_click,
    on_config_change,
    on_drop,
  }: {
    rows: BaseNoteRow[];
    config: KanbanConfig | null;
    available_properties: PropertyInfo[];
    on_note_click: (path: string) => void;
    on_config_change: (config: KanbanConfig) => void;
    on_drop?: (note_path: string, key: string, value: string) => void;
  } = $props();

  const groupable_properties = $derived(
    available_properties.filter((p) => p.unique_values !== null),
  );

  const group_by = $derived(config?.group_by ?? "");

  const columns: KanbanColumn[] = $derived.by(() => {
    if (!group_by) return [];
    return group_rows_by_property(rows, group_by, config?.column_order);
  });

  let drag_over_column: string | null = $state(null);
  let dragging_path: string | null = $state(null);

  function handle_dragstart(e: DragEvent, path: string) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("text/plain", path);
    e.dataTransfer.effectAllowed = "move";
    dragging_path = path;
  }

  function handle_dragend() {
    dragging_path = null;
    drag_over_column = null;
  }

  function handle_dragover(e: DragEvent, column_value: string) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    drag_over_column = column_value;
  }

  function handle_dragleave(e: DragEvent, column_value: string) {
    const related = e.relatedTarget as HTMLElement | null;
    const current = e.currentTarget as HTMLElement;
    if (related && current.contains(related)) return;
    if (drag_over_column === column_value) drag_over_column = null;
  }

  function handle_drop_on_column(e: DragEvent, column_value: string) {
    e.preventDefault();
    drag_over_column = null;
    dragging_path = null;
    const note_path = e.dataTransfer?.getData("text/plain");
    if (!note_path || !group_by || !on_drop) return;
    const value = column_value === "Unset" ? "" : column_value;
    on_drop(note_path, group_by, value);
  }
</script>

{#if !group_by}
  <div class="h-full flex flex-col items-center justify-center gap-3 p-8">
    <p class="text-sm text-muted-foreground">Select a property to group by:</p>
    <div class="flex flex-wrap gap-2 justify-center max-w-md">
      {#each groupable_properties as prop}
        <button
          class="px-3 py-1.5 text-xs bg-muted rounded-md hover:bg-accent transition-colors"
          onclick={() => on_config_change({ group_by: prop.name })}
        >
          {prop.name}
          <span class="text-muted-foreground ml-1">({prop.count})</span>
        </button>
      {/each}
      {#if groupable_properties.length === 0}
        <p class="text-xs text-muted-foreground">
          No low-cardinality properties found. Add frontmatter properties like
          "status" or "priority" to your notes.
        </p>
      {/if}
    </div>
  </div>
{:else}
  <div class="h-full flex flex-col">
    <div class="flex items-center gap-2 px-4 py-2 border-b border-border">
      <span class="text-[10px] text-muted-foreground uppercase tracking-wider"
        >Group by:</span
      >
      <div class="relative">
        <select
          class="text-xs pl-2 pr-6 py-1 bg-muted border border-border rounded-md appearance-none cursor-pointer"
          value={group_by}
          onchange={(e) =>
            on_config_change({
              ...config,
              group_by: (e.target as HTMLSelectElement).value,
            })}
        >
          {#each groupable_properties as prop}
            <option value={prop.name}>{prop.name}</option>
          {/each}
        </select>
        <ChevronDown
          size={10}
          class="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
      </div>
    </div>

    <div class="flex-1 overflow-x-auto overflow-y-hidden">
      <div class="flex h-full gap-4 p-4 min-w-min">
        {#each columns as column}
          <div
            class="flex flex-col w-64 min-w-[256px] bg-muted/50 rounded-lg border transition-colors {drag_over_column ===
            column.value
              ? 'border-blue-400 dark:border-blue-500'
              : 'border-border'}"
            role="group"
            ondragover={(e) => handle_dragover(e, column.value)}
            ondragleave={(e) => handle_dragleave(e, column.value)}
            ondrop={(e) => handle_drop_on_column(e, column.value)}
          >
            <div
              class="flex items-center justify-between px-3 py-2 border-b border-border"
            >
              <span class="text-xs font-semibold truncate">{column.value}</span>
              <span
                class="text-[10px] text-muted-foreground tabular-nums ml-2 shrink-0"
              >
                {column.rows.length}
              </span>
            </div>
            <div class="flex-1 overflow-y-auto p-2 space-y-2">
              {#each column.rows as row}
                <button
                  type="button"
                  class="w-full text-left p-2.5 bg-card rounded-md border border-border hover:border-border/60 transition-colors cursor-pointer shadow-sm {dragging_path ===
                  row.note.path
                    ? 'opacity-50'
                    : ''}"
                  draggable="true"
                  ondragstart={(e) => handle_dragstart(e, row.note.path)}
                  ondragend={handle_dragend}
                  onclick={() => on_note_click(row.note.path)}
                >
                  <div class="text-xs font-medium mb-1 truncate">
                    {row.note.title || row.note.name}
                  </div>
                  {#if row.tags.length > 0}
                    <div class="flex flex-wrap gap-1 mb-1">
                      {#each row.tags.slice(0, 3) as tag}
                        <span
                          class="px-1 py-0.5 rounded bg-muted text-[9px] text-muted-foreground"
                        >
                          #{tag}
                        </span>
                      {/each}
                    </div>
                  {/if}
                  {#if row.stats.task_count > 0}
                    <div class="text-[10px] text-muted-foreground">
                      {row.stats.tasks_done}/{row.stats.task_count} tasks
                    </div>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
