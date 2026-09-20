<script lang="ts">
  import { createVirtualizer } from "@tanstack/svelte-virtual";
  import { RangeCalendar } from "bits-ui";
  import {
    getLocalTimeZone,
    parseDate,
    today,
    type DateValue,
  } from "@internationalized/date";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Popover from "$lib/components/ui/popover";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import EntryContextMenu from "./entry_context_menu.svelte";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import CalendarRange from "@lucide/svelte/icons/calendar-range";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Files from "@lucide/svelte/icons/files";
  import { file_icon_for_path } from "$lib/features/folder/ui/file_icons";
  import {
    custom_recents_period,
    parse_custom_date_range,
  } from "$lib/features/folder/domain/recents";
  import type { BaseNoteRow } from "$lib/features/bases";
  import type { NoteMeta } from "$lib/shared/types/note";
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
    show_non_markdown: boolean;
    error?: string | null;
    on_change_sort: (sort: RecentsSort) => void;
    on_change_direction: (direction: SortDirection) => void;
    on_change_period: (period: RecentsPeriod) => void;
    on_change_show_non_markdown: (show_non_markdown: boolean) => void;
    on_open_note: (path: string) => void;
    is_starred?: (path: string) => boolean;
    on_toggle_star?: (note: NoteMeta) => void;
    on_open_to_side?: (note: NoteMeta) => void;
    on_open_in_new_window?: (note: NoteMeta) => void;
    on_reveal_in_finder?: (note: NoteMeta) => void;
    on_open_in_default_app?: (note: NoteMeta) => void;
    on_rename?: (note: NoteMeta) => void;
    on_delete?: (note: NoteMeta) => void;
  };

  let {
    results,
    sort,
    direction,
    period,
    show_non_markdown,
    error = null,
    on_change_sort,
    on_change_direction,
    on_change_period,
    on_change_show_non_markdown,
    on_open_note,
    is_starred,
    on_toggle_star,
    on_open_to_side,
    on_open_in_new_window,
    on_reveal_in_finder,
    on_open_in_default_app,
    on_rename,
    on_delete,
  }: Props = $props();

  function bind_note(
    callback: ((note: NoteMeta) => void) | undefined,
    note: NoteMeta,
  ): ((path: string) => void) | undefined {
    return callback ? () => callback(note) : undefined;
  }

  const SORT_OPTIONS: { value: RecentsSort; label: string }[] = [
    { value: "modified", label: "Modified" },
    { value: "created", label: "Created" },
    { value: "title", label: "Title" },
  ];

  const PERIOD_OPTIONS: { value: RecentsPeriod; label: string }[] = [
    { value: "all", label: "All" },
    { value: "today", label: "Today" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
  ];

  const custom_range = $derived(parse_custom_date_range(period));

  const calendar_value = $derived({
    start: custom_range ? parseDate(custom_range.start_day) : undefined,
    end: custom_range ? parseDate(custom_range.end_day) : undefined,
  });

  const custom_period_label = $derived(
    custom_range
      ? `${format_short_date(custom_range.start_ms)} – ${format_short_date(custom_range.end_ms)}`
      : "Dates",
  );

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

  function format_short_date(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  function day_key(date: DateValue): string {
    return `${String(date.year)}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
  }

  /* bits-ui reports the first click as {start, end: undefined}; committing
     that would flow back into the calendar and reset the selection on the
     second click, so the half-finished range lives here until both ends are
     picked. A start left alone when the popover closes reads as "since that
     day", so its end defaults to today. */
  type DraftRange = {
    start: DateValue | undefined;
    end: DateValue | undefined;
  };
  let draft_range = $state<DraftRange>({ start: undefined, end: undefined });

  function commit_range(start: DateValue, end: DateValue) {
    on_change_period(custom_recents_period(day_key(start), day_key(end)));
  }

  function on_popover_open_change(open: boolean) {
    if (open) {
      draft_range = { ...calendar_value };
      return;
    }
    if (draft_range.start && !draft_range.end) {
      commit_range(draft_range.start, today(getLocalTimeZone()));
    }
  }

  function on_custom_range_change(value: DraftRange) {
    draft_range = value;
    if (value.start && value.end) commit_range(value.start, value.end);
  }

  function toggle_direction() {
    on_change_direction(direction === "asc" ? "desc" : "asc");
  }
</script>

<div class="flex flex-col h-full min-h-0">
  <div
    class="flex flex-wrap items-center gap-1 border-b border-zinc-200 dark:border-zinc-800 px-2 py-1.5 shrink-0"
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

    <button
      type="button"
      class="flex items-center justify-center h-7 w-7 rounded transition-colors {show_non_markdown
        ? 'bg-zinc-100 text-foreground dark:bg-zinc-900'
        : 'text-zinc-500 hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-900'}"
      title={show_non_markdown
        ? "Showing all file types"
        : "Showing notes only"}
      aria-label="Toggle non-markdown files"
      aria-pressed={show_non_markdown}
      onclick={() => on_change_show_non_markdown(!show_non_markdown)}
    >
      <Files class="size-3.5" />
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

      <Popover.Root onOpenChange={on_popover_open_change}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              type="button"
              class="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors {custom_range
                ? 'bg-zinc-100 text-foreground dark:bg-zinc-900'
                : 'text-zinc-500 hover:text-foreground'}"
              aria-pressed={custom_range !== null}
              title="Custom date range"
            >
              <CalendarRange class="size-3.5 shrink-0" />
              <span class="max-w-28 truncate">{custom_period_label}</span>
            </button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content class="w-auto p-2" align="end">
          <RangeCalendar.Root
            value={draft_range}
            onValueChange={on_custom_range_change}
            weekStartsOn={1}
            fixedWeeks={true}
            calendarLabel="Recents date range"
          >
            {#snippet children({ months, weekdays })}
              <RangeCalendar.Header
                class="flex items-center justify-between pb-2"
              >
                <RangeCalendar.PrevButton
                  class="flex size-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  <ChevronLeft class="size-4" />
                </RangeCalendar.PrevButton>
                <RangeCalendar.Heading class="text-xs font-medium" />
                <RangeCalendar.NextButton
                  class="flex size-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  <ChevronRight class="size-4" />
                </RangeCalendar.NextButton>
              </RangeCalendar.Header>
              {#each months as month}
                <RangeCalendar.Grid class="w-full border-collapse">
                  <RangeCalendar.GridHead>
                    <RangeCalendar.GridRow class="flex">
                      {#each weekdays as weekday}
                        <RangeCalendar.HeadCell
                          class="flex-1 pb-1 text-center text-[10px] text-zinc-500"
                        >
                          {weekday}
                        </RangeCalendar.HeadCell>
                      {/each}
                    </RangeCalendar.GridRow>
                  </RangeCalendar.GridHead>
                  <RangeCalendar.GridBody>
                    {#each month.weeks as week}
                      <RangeCalendar.GridRow class="flex">
                        {#each week as day}
                          <RangeCalendar.Cell
                            date={day}
                            month={month.value}
                            class="flex flex-1 items-center justify-center p-px"
                          >
                            <RangeCalendar.Day
                              class="flex size-7 items-center justify-center rounded text-xs cursor-pointer text-zinc-600 hover:bg-zinc-100 data-[selected]:bg-blue-500 data-[selected]:text-white data-[selection-start]:rounded-r-none data-[selection-end]:rounded-l-none data-[outside-month]:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-900"
                            />
                          </RangeCalendar.Cell>
                        {/each}
                      </RangeCalendar.GridRow>
                    {/each}
                  </RangeCalendar.GridBody>
                </RangeCalendar.Grid>
              {/each}
            {/snippet}
          </RangeCalendar.Root>
        </Popover.Content>
      </Popover.Root>
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
      No recent files
    </div>
  {:else}
    <div bind:this={scroll_container} class="flex-1 min-h-0 overflow-auto">
      <div class="relative w-full" style="height: {total_size}px">
        {#each virtual_items as virtual_row (virtual_row.key)}
          {@const row = results[virtual_row.index]}
          {#if row}
            {@const RowIcon = file_icon_for_path(row.note.path)}
            <div
              class="absolute left-0 top-0 w-full"
              style="height: {virtual_row.size}px; transform: translateY({virtual_row.start}px)"
            >
              <ContextMenu.Root>
                <ContextMenu.Trigger class="block w-full h-full">
                  <button
                    type="button"
                    class="flex flex-col items-start w-full h-full px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    onclick={() => on_open_note(row.note.path)}
                  >
                    <div class="flex items-center gap-1.5 w-full min-w-0">
                      <RowIcon
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
                      <span
                        class="text-[10px] text-zinc-500 truncate w-full pl-5"
                      >
                        {row.note.blurb}
                      </span>
                    {/if}
                  </button>
                </ContextMenu.Trigger>
                <EntryContextMenu
                  path={row.note.path}
                  starred={is_starred?.(row.note.path) ?? false}
                  on_toggle_star={bind_note(on_toggle_star, row.note)}
                  on_open_to_side={bind_note(on_open_to_side, row.note)}
                  on_open_in_new_window={bind_note(
                    on_open_in_new_window,
                    row.note,
                  )}
                  on_reveal_in_finder={bind_note(on_reveal_in_finder, row.note)}
                  on_open_in_default_app={bind_note(
                    on_open_in_default_app,
                    row.note,
                  )}
                  on_rename={bind_note(on_rename, row.note)}
                  on_delete={bind_note(on_delete, row.note)}
                />
              </ContextMenu.Root>
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</div>
