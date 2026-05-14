import { describe, it, expect } from "vitest";
import { build_calendar_month } from "$lib/features/bases/domain/calendar_bucketing";
import type { BaseNoteRow } from "$lib/features/bases/ports";
import { as_note_path } from "$lib/shared/types/ids";

function make_row(
  path: string,
  properties: Record<string, string> = {},
  next_due_date: string | null = null,
): BaseNoteRow {
  return {
    note: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: path.replace(".md", ""),
      title: path.replace(".md", ""),
      blurb: "",
      mtime_ms: 0,
      ctime_ms: 0,
      size_bytes: 0,
      file_type: "markdown",
    },
    properties: Object.fromEntries(
      Object.entries(properties).map(([k, v]) => [
        k,
        { value: v, property_type: "date" },
      ]),
    ),
    tags: [],
    stats: {
      word_count: 0,
      char_count: 0,
      heading_count: 0,
      outlink_count: 0,
      reading_time_secs: 0,
      task_count: 0,
      tasks_done: 0,
      tasks_todo: 0,
      next_due_date,
      last_indexed_at: 0,
    },
  };
}

describe("build_calendar_month", () => {
  it("produces correct number of days for a month grid", () => {
    const cal = build_calendar_month(2026, 0, [], "next_due_date");
    expect(cal.year).toBe(2026);
    expect(cal.month).toBe(0);
    expect(cal.label).toContain("January");
    expect(cal.days.length % 7).toBe(0);
    expect(cal.days.length).toBeGreaterThanOrEqual(28);
  });

  it("places notes on correct days using next_due_date", () => {
    const rows = [
      make_row("a.md", {}, "2026-01-15"),
      make_row("b.md", {}, "2026-01-15"),
      make_row("c.md", {}, "2026-01-20"),
    ];

    const cal = build_calendar_month(2026, 0, rows, "next_due_date");
    const jan15 = cal.days.find(
      (d) => d.date === "2026-01-15" && d.is_current_month,
    );
    const jan20 = cal.days.find(
      (d) => d.date === "2026-01-20" && d.is_current_month,
    );
    expect(jan15).toBeDefined();
    expect(jan15!.rows).toHaveLength(2);
    expect(jan20).toBeDefined();
    expect(jan20!.rows).toHaveLength(1);
  });

  it("places notes using a custom date property", () => {
    const rows = [make_row("a.md", { deadline: "2026-03-10" })];

    const cal = build_calendar_month(2026, 2, rows, "deadline");
    const mar10 = cal.days.find(
      (d) => d.date === "2026-03-10" && d.is_current_month,
    );
    expect(mar10!.rows).toHaveLength(1);
  });

  it("marks current month days correctly", () => {
    const cal = build_calendar_month(2026, 5, [], "next_due_date");
    const current_month_days = cal.days.filter((d) => d.is_current_month);
    expect(current_month_days.length).toBe(30);
  });

  it("handles rows without date property gracefully", () => {
    const rows = [make_row("a.md", {}, null)];
    const cal = build_calendar_month(2026, 0, rows, "next_due_date");
    const days_with_rows = cal.days.filter((d) => d.rows.length > 0);
    expect(days_with_rows).toHaveLength(0);
  });

  it("handles February correctly", () => {
    const cal = build_calendar_month(2026, 1, [], "next_due_date");
    const feb_days = cal.days.filter((d) => d.is_current_month);
    expect(feb_days.length).toBe(28);
  });

  it("handles leap year February", () => {
    const cal = build_calendar_month(2028, 1, [], "next_due_date");
    const feb_days = cal.days.filter((d) => d.is_current_month);
    expect(feb_days.length).toBe(29);
  });
});
