<script lang="ts">
  import { createVirtualizer } from "@tanstack/svelte-virtual";
  import * as Select from "$lib/components/ui/select/index.js";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import FileText from "@lucide/svelte/icons/file-text";
  import type { BaseNoteRow } from "$lib/features/bases";
  import type {
    RecentsPeriod,
    RecentsSort,
    SortDirection,
  } from "$lib/shared/types/editor_settings";

  type Props = {
    results: BaseNoteRow[];
    sort: RecentsSort;
    direction: SortDirection;
    period: RecentsPeriod;
    error?: string | null;
    on_change_sort: (sort: RecentsSort) => void;
    on_change_direction: (direction: SortDirection) => void;
    on_change_period: (period: RecentsPeriod) => void;
    on_open_note: (path: string) => void;
  };

  let {
    results,
    sort,
    direction,
    period,
    error = null,
    on_change_sort,
    on_change_direction,
    on_change_period,
    on_open_note,
  }: Props = $props();

  const SORT_OPTIONS: { value: RecentsSort; label: string }[] = [
    { value: "modified", label: "Modified" },
    { value: "created", label: "Created" },
    { value: "title", label: "Title" },
  ];

  const PERIOD_OPTIONS: { value: RecentsPeriod; label: string }[] = [
    { value: "all", label: "All" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
    { value: "quarter", label: "Quarter" },
  ];

  const ROW_HEIGHT = 48;
  const OVERSCAN = 8;

  let scroll_container: HTMLDivElement | null = $state(null);
  let previous_results_count = -1;

  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: 0,
    getScrollElement: () => scroll_container,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  $effect(() => {
    const v = $virtualizer;
    if (!v) return;
    /* measure() notifies the $virtualizer store, which re-runs this effect;
       the count guard is what terminates that cycle */
    const next_count = results.length;
    if (next_count === previous_results_count) return;
    previous_results_count = next_count;
    v.setOptions({ count: next_count });
    v.measure();
  });

  const virtual_items = $derived.by(() => {
    void results;
    const v = $virtualizer;
    return v ? v.getVirtualItems() : [];
  });

  const total_size = $derived.by(() => {
    void results;
    const v = $virtualizer;
    return v ? v.getTotalSize() : results.length * ROW_HEIGHT;
  });

  const current_sort_label = $derived(
    SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Modified",
  );

  function timestamp_of(row: BaseNoteRow): number {
    return sort === "created" ? row.note.ctime_ms : row.note.mtime_ms;
  }

  function format_timestamp(ms: number): string {
    if (!ms) return "";
    return new Date(ms).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function toggle_direction() {
    on_change_direction(direction === "asc" ? "desc" : "asc");
  }
</script>

<div class="flex flex-col h-full min-h-0">
  <div
    class="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800 px-2 py-1.5 shrink-0"
  >
    <Select.Root
      type="single"
      value={sort}
      onValueChange={(v: string | undefined) => {
        if (v === "modified" || v === "created" || v === "title") {
          on_change_sort(v);
        }
      }}
    >
      <Select.Trigger class="h-7 w-28 text-xs">
        <span data-slot="select-value">{current_sort_label}</span>
      </Select.Trigger>
      <Select.Content>
        {#each SORT_OPTIONS as option (option.value)}
          <Select.Item value={option.value}>{option.label}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>

    <button
      type="button"
      class="flex items-center justify-center h-7 w-7 rounded text-zinc-500 hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-900"
      title={direction === "asc" ? "Ascending" : "Descending"}
      aria-label="Toggle sort direction"
      onclick={toggle_direction}
    >
      {#if direction === "asc"}
        <ArrowUp class="size-3.5" />
      {:else}
        <ArrowDown class="size-3.5" />
      {/if}
    </button>

    <div class="ml-auto flex items-center gap-0.5">
      {#each PERIOD_OPTIONS as option (option.value)}
        <button
          type="button"
          class="px-2 py-1 text-xs font-medium rounded transition-colors {period ===
          option.value
            ? 'bg-zinc-100 text-foreground dark:bg-zinc-900'
            : 'text-zinc-500 hover:text-foreground'}"
          aria-pressed={period === option.value}
          onclick={() => on_change_period(option.value)}
        >
          {option.label}
        </button>
      {/each}
    </div>
  </div>

  {#if error}
    <div
      class="flex-1 flex items-center justify-center px-3 text-center text-xs text-destructive"
    >
      {error}
    </div>
  {:else if results.length === 0}
    <div class="flex-1 flex items-center justify-center text-xs text-zinc-500">
      No recent notes
    </div>
  {:else}
    <div bind:this={scroll_container} class="flex-1 min-h-0 overflow-auto">
      <div class="relative w-full" style="height: {total_size}px">
        {#each virtual_items as virtual_row (virtual_row.key)}
          {@const row = results[virtual_row.index]}
          {#if row}
            <div
              class="absolute left-0 top-0 w-full"
              style="height: {virtual_row.size}px; transform: translateY({virtual_row.start}px)"
            >
              <button
                type="button"
                class="flex flex-col items-start w-full h-full px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
                onclick={() => on_open_note(row.note.path)}
              >
                <div class="flex items-center gap-1.5 w-full min-w-0">
                  <FileText
                    class="size-3.5 shrink-0"
                    style={row.note.color
                      ? `color: ${row.note.color}`
                      : undefined}
                  />
                  <span class="text-xs font-medium truncate">
                    {row.note.title || row.note.name}
                  </span>
                  <span class="ml-auto text-[10px] text-zinc-500 shrink-0">
                    {format_timestamp(timestamp_of(row))}
                  </span>
                </div>
                {#if row.note.blurb}
                  <span class="text-[10px] text-zinc-500 truncate w-full pl-5">
                    {row.note.blurb}
                  </span>
                {/if}
              </button>
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</div>
