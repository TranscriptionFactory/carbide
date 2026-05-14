import type { BaseNoteRow } from "../ports";

export type CalendarDay = {
  date: string;
  day: number;
  rows: BaseNoteRow[];
  is_today: boolean;
  is_current_month: boolean;
};

export type CalendarMonth = {
  year: number;
  month: number;
  label: string;
  days: CalendarDay[];
};

export function build_calendar_month(
  year: number,
  month: number,
  rows: BaseNoteRow[],
  date_property: string,
): CalendarMonth {
  const first_day = new Date(year, month, 1);
  const start_weekday = first_day.getDay();
  const days_in_month = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  const today_str = format_date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const date_map = new Map<string, BaseNoteRow[]>();
  for (const row of rows) {
    const date_val = extract_date(row, date_property);
    if (!date_val) continue;
    const list = date_map.get(date_val);
    if (list) {
      list.push(row);
    } else {
      date_map.set(date_val, [row]);
    }
  }

  const days: CalendarDay[] = [];

  const prev_month_days = new Date(year, month, 0).getDate();
  for (let i = start_weekday - 1; i >= 0; i--) {
    const d = prev_month_days - i;
    const prev_month = month === 0 ? 11 : month - 1;
    const prev_year = month === 0 ? year - 1 : year;
    const date = format_date(prev_year, prev_month, d);
    days.push({
      date,
      day: d,
      rows: date_map.get(date) ?? [],
      is_today: date === today_str,
      is_current_month: false,
    });
  }

  for (let d = 1; d <= days_in_month; d++) {
    const date = format_date(year, month, d);
    days.push({
      date,
      day: d,
      rows: date_map.get(date) ?? [],
      is_today: date === today_str,
      is_current_month: true,
    });
  }

  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    const next_month = month === 11 ? 0 : month + 1;
    const next_year = month === 11 ? year + 1 : year;
    for (let d = 1; d <= remaining; d++) {
      const date = format_date(next_year, next_month, d);
      days.push({
        date,
        day: d,
        rows: date_map.get(date) ?? [],
        is_today: date === today_str,
        is_current_month: false,
      });
    }
  }

  const label = first_day.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return { year, month, label, days };
}

function extract_date(row: BaseNoteRow, property: string): string | null {
  if (property === "next_due_date") {
    return row.stats.next_due_date ?? null;
  }
  if (property === "mtime_ms" || property === "ctime_ms") {
    const ms = property === "mtime_ms" ? row.note.mtime_ms : row.note.ctime_ms;
    if (!ms) return null;
    const d = new Date(ms);
    return format_date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const val = row.properties[property]?.value;
  if (!val) return null;
  const match = val.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function format_date(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
