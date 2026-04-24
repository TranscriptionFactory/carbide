<script lang="ts">
  import { Calendar } from "bits-ui";
  import {
    CalendarDate,
    today,
    getLocalTimeZone,
    type DateValue,
  } from "@internationalized/date";
  import { CalendarDays, ChevronLeft, ChevronRight } from "@lucide/svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import { parse_daily_note_date } from "$lib/features/daily_notes/domain/daily_note_path";

  const { stores, action_registry } = use_app_context();

  const daily_dates = $derived.by(() => {
    const settings = stores.ui.editor_settings;
    const folder = settings.daily_notes_folder;
    const format = settings.daily_note_name_format;
    const dates = new Set<string>();
    for (const note of stores.notes.notes) {
      const d = parse_daily_note_date(folder, format, note.path);
      if (d) {
        dates.add(
          `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        );
      }
    }
    return dates;
  });

  const today_date = today(getLocalTimeZone());

  function has_note(date: DateValue): boolean {
    const key = `${String(date.year)}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
    return daily_dates.has(key);
  }

  function is_today(date: DateValue): boolean {
    return (
      date.year === today_date.year &&
      date.month === today_date.month &&
      date.day === today_date.day
    );
  }

  function on_date_select(value: DateValue | undefined) {
    if (!value) return;
    const js_date = new Date(value.year, value.month - 1, value.day);
    void action_registry.execute(ACTION_IDS.daily_notes_open_date, js_date);
  }
</script>

<div class="DailyNotesPanel">
  <div class="DailyNotesPanel__header">
    <CalendarDays class="DailyNotesPanel__icon" />
    <span class="DailyNotesPanel__title">Daily Notes</span>
  </div>

  <div class="DailyNotesPanel__calendar">
    <Calendar.Root
      type="single"
      weekStartsOn={1}
      fixedWeeks={true}
      calendarLabel="Daily notes calendar"
      onValueChange={on_date_select}
    >
      {#snippet children({ months, weekdays })}
        <Calendar.Header class="DailyNotesCalendar__header">
          <Calendar.PrevButton class="DailyNotesCalendar__nav-btn">
            <ChevronLeft class="size-4" />
          </Calendar.PrevButton>
          <Calendar.Heading class="DailyNotesCalendar__heading" />
          <Calendar.NextButton class="DailyNotesCalendar__nav-btn">
            <ChevronRight class="size-4" />
          </Calendar.NextButton>
        </Calendar.Header>

        {#each months as month}
          <Calendar.Grid class="DailyNotesCalendar__grid">
            <Calendar.GridHead>
              <Calendar.GridRow class="DailyNotesCalendar__weekday-row">
                {#each weekdays as weekday}
                  <Calendar.HeadCell class="DailyNotesCalendar__weekday">
                    {weekday}
                  </Calendar.HeadCell>
                {/each}
              </Calendar.GridRow>
            </Calendar.GridHead>
            <Calendar.GridBody>
              {#each month.weeks as week}
                <Calendar.GridRow class="DailyNotesCalendar__week">
                  {#each week as day}
                    <Calendar.Cell
                      date={day}
                      month={month.value}
                      class="DailyNotesCalendar__cell"
                    >
                      <Calendar.Day>
                        {#snippet children({ selected })}
                          <span
                            class="DailyNotesCalendar__day"
                            class:DailyNotesCalendar__day--has-note={has_note(
                              day,
                            )}
                            class:DailyNotesCalendar__day--today={is_today(day)}
                            class:DailyNotesCalendar__day--selected={selected}
                          >
                            {day.day}
                          </span>
                        {/snippet}
                      </Calendar.Day>
                    </Calendar.Cell>
                  {/each}
                </Calendar.GridRow>
              {/each}
            </Calendar.GridBody>
          </Calendar.Grid>
        {/each}
      {/snippet}
    </Calendar.Root>
  </div>
</div>

<style>
  .DailyNotesPanel {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: var(--space-2);
  }

  .DailyNotesPanel__header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    margin-bottom: var(--space-2);
  }

  :global(.DailyNotesPanel__icon) {
    width: 16px;
    height: 16px;
    opacity: 0.7;
  }

  .DailyNotesPanel__title {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--sidebar-foreground);
  }

  .DailyNotesPanel__calendar {
    padding: var(--space-1);
  }

  :global(.DailyNotesCalendar__header) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: var(--space-2);
  }

  :global(.DailyNotesCalendar__heading) {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--sidebar-foreground);
  }

  :global(.DailyNotesCalendar__nav-btn) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--sidebar-foreground);
    opacity: 0.6;
    transition: opacity var(--duration-fast) var(--ease-default);
  }

  :global(.DailyNotesCalendar__nav-btn:hover) {
    opacity: 1;
    background-color: var(--sidebar-accent);
  }

  :global(.DailyNotesCalendar__grid) {
    width: 100%;
    border-collapse: collapse;
  }

  :global(.DailyNotesCalendar__weekday-row) {
    display: flex;
  }

  :global(.DailyNotesCalendar__weekday) {
    flex: 1;
    text-align: center;
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    padding-bottom: var(--space-1);
  }

  :global(.DailyNotesCalendar__week) {
    display: flex;
  }

  :global(.DailyNotesCalendar__cell) {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1px;
  }

  .DailyNotesCalendar__day {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    color: var(--sidebar-foreground);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .DailyNotesCalendar__day:hover {
    background-color: var(--sidebar-accent);
  }

  .DailyNotesCalendar__day--has-note {
    font-weight: 600;
    color: var(--interactive);
  }

  .DailyNotesCalendar__day--today::after {
    content: "";
    position: absolute;
    bottom: 2px;
    left: 50%;
    transform: translateX(-50%);
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background-color: var(--interactive);
  }

  .DailyNotesCalendar__day--selected {
    background-color: var(--interactive);
    color: var(--interactive-foreground);
  }

  .DailyNotesCalendar__day--selected:hover {
    background-color: var(--interactive);
  }

  :global([data-outside-month] .DailyNotesCalendar__day) {
    opacity: 0.3;
  }

  :global([data-disabled] .DailyNotesCalendar__day) {
    opacity: 0.3;
    cursor: default;
  }
</style>
