<script lang="ts">
  import type { BaseNoteRow, CalendarConfig, PropertyInfo } from "../ports";
  import { build_calendar_month } from "../domain/calendar_bucketing";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";

  let {
    rows,
    config,
    available_properties,
    on_note_click,
    on_config_change,
  }: {
    rows: BaseNoteRow[];
    config: CalendarConfig | null;
    available_properties: PropertyInfo[];
    on_note_click: (path: string) => void;
    on_config_change: (config: CalendarConfig) => void;
  } = $props();

  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const date_properties = $derived.by(() => {
    const props: Array<{ name: string; label: string }> = [
      { name: "next_due_date", label: "Due date" },
      { name: "mtime_ms", label: "Modified" },
      { name: "ctime_ms", label: "Created" },
    ];
    for (const p of available_properties) {
      if (p.property_type === "date") {
        props.push({ name: p.name, label: p.name });
      }
    }
    return props;
  });

  const date_property = $derived(config?.date_property ?? "next_due_date");

  const now = new Date();
  let view_year = $state(now.getFullYear());
  let view_month = $state(now.getMonth());

  const calendar = $derived(
    build_calendar_month(view_year, view_month, rows, date_property),
  );

  function prev_month() {
    if (view_month === 0) {
      view_month = 11;
      view_year--;
    } else {
      view_month--;
    }
  }

  function next_month() {
    if (view_month === 11) {
      view_month = 0;
      view_year++;
    } else {
      view_month++;
    }
  }

  function go_today() {
    const today = new Date();
    view_year = today.getFullYear();
    view_month = today.getMonth();
  }

  const MAX_VISIBLE_NOTES = 3;
</script>

<div class="h-full flex flex-col">
  <div
    class="flex items-center justify-between px-4 py-2 border-b border-border"
  >
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-1">
        <button
          class="p-1 hover:bg-accent rounded"
          onclick={prev_month}
        >
          <ChevronLeft size={14} />
        </button>
        <span class="text-sm font-semibold w-40 text-center"
          >{calendar.label}</span
        >
        <button
          class="p-1 hover:bg-accent rounded"
          onclick={next_month}
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <button
        class="text-[10px] px-2 py-0.5 bg-muted rounded hover:bg-accent"
        onclick={go_today}
      >
        Today
      </button>
    </div>
    <div class="flex items-center gap-2">
      <span class="text-[10px] text-muted-foreground uppercase tracking-wider"
        >Date:</span
      >
      <div class="relative">
        <select
          class="text-xs pl-2 pr-6 py-1 bg-muted border border-border rounded-md appearance-none cursor-pointer"
          value={date_property}
          onchange={(e) =>
            on_config_change({
              date_property: (e.target as HTMLSelectElement).value,
            })}
        >
          {#each date_properties as prop}
            <option value={prop.name}>{prop.label}</option>
          {/each}
        </select>
        <ChevronDown
          size={10}
          class="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
      </div>
    </div>
  </div>

  <div class="flex-1 overflow-auto p-2">
    <div class="grid grid-cols-7 gap-px">
      {#each WEEKDAYS as day}
        <div
          class="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-2"
        >
          {day}
        </div>
      {/each}
      {#each calendar.days as day}
        <div
          class="min-h-[80px] p-1 border border-border rounded-sm {day.is_current_month
            ? ''
            : 'opacity-40'} {day.is_today
            ? 'bg-blue-50/50 dark:bg-blue-950/20 ring-1 ring-blue-200 dark:ring-blue-800'
            : ''}"
        >
          <div
            class="text-[10px] tabular-nums mb-0.5 {day.is_today
              ? 'font-bold text-blue-600 dark:text-blue-400'
              : 'text-muted-foreground'}"
          >
            {day.day}
          </div>
          <div class="space-y-0.5">
            {#each day.rows.slice(0, MAX_VISIBLE_NOTES) as row}
              <button
                type="button"
                class="w-full text-left text-[10px] px-1 py-0.5 rounded bg-muted hover:bg-accent truncate cursor-pointer transition-colors"
                onclick={() => on_note_click(row.note.path)}
                title={row.note.title || row.note.name}
              >
                {row.note.title || row.note.name}
              </button>
            {/each}
            {#if day.rows.length > MAX_VISIBLE_NOTES}
              <div class="text-[9px] text-muted-foreground px-1">
                +{day.rows.length - MAX_VISIBLE_NOTES} more
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
