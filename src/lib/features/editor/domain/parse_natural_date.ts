export function format_date(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${String(y)}-${m}-${day}`;
}

const DAYS_OF_WEEK = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function next_weekday(now: Date, target_day: number): Date {
  const current_day = now.getDay();
  let diff = target_day - current_day;
  if (diff <= 0) diff += 7;
  const result = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  result.setDate(result.getDate() + diff);
  return result;
}

function last_weekday(now: Date, target_day: number): Date {
  const current_day = now.getDay();
  let diff = current_day - target_day;
  if (diff <= 0) diff += 7;
  const result = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  result.setDate(result.getDate() - diff);
  return result;
}

export function parse_natural_date(
  query: string,
  now: Date,
): { label: string; date: Date } | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (q === "today") return { label: "Today", date: today };

  if (q === "tomorrow") {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return { label: "Tomorrow", date: d };
  }

  if (q === "yesterday") {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return { label: "Yesterday", date: d };
  }

  for (let i = 0; i < DAYS_OF_WEEK.length; i++) {
    const day_name = DAYS_OF_WEEK[i]!;
    if (q === `next ${day_name}`) {
      const d = next_weekday(today, i);
      const cap = day_name[0]!.toUpperCase() + day_name.slice(1);
      return { label: `Next ${cap}`, date: d };
    }
    if (q === `last ${day_name}`) {
      const d = last_weekday(today, i);
      const cap = day_name[0]!.toUpperCase() + day_name.slice(1);
      return { label: `Last ${cap}`, date: d };
    }
  }

  const in_match = /^in (\d+) (days?|weeks?)$/.exec(q);
  if (in_match) {
    const n = parseInt(in_match[1]!, 10);
    if (Number.isNaN(n) || n <= 0) return null;
    const d = new Date(today);
    const unit = in_match[2]!;
    if (unit.startsWith("week")) {
      d.setDate(d.getDate() + n * 7);
    } else {
      d.setDate(d.getDate() + n);
    }
    return { label: `In ${String(n)} ${unit}`, date: d };
  }

  const month_day_match = /^([a-z]+)\s+(\d{1,2})$/.exec(q);
  if (month_day_match) {
    const month_idx = MONTHS[month_day_match[1]!];
    if (month_idx !== undefined) {
      const day_num = parseInt(month_day_match[2]!, 10);
      if (day_num >= 1 && day_num <= 31) {
        const d = new Date(now.getFullYear(), month_idx, day_num);
        if (d.getMonth() === month_idx) {
          const month_name = month_day_match[1]!;
          const cap = month_name[0]!.toUpperCase() + month_name.slice(1);
          return { label: `${cap} ${String(day_num)}`, date: d };
        }
      }
    }
  }

  const iso_match = /^\d{4}-\d{2}-\d{2}$/.exec(q);
  if (iso_match) {
    const parts = q.split("-");
    const d = new Date(
      parseInt(parts[0]!, 10),
      parseInt(parts[1]!, 10) - 1,
      parseInt(parts[2]!, 10),
    );
    if (!Number.isNaN(d.getTime())) {
      return { label: q, date: d };
    }
  }

  return null;
}

type DatePresetItem = {
  label: string;
  date_str: string;
  description: string;
};

export function generate_date_presets(now: Date): DatePresetItem[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const presets: DatePresetItem[] = [
    {
      label: "Today",
      date_str: format_date(today),
      description: "Today's date",
    },
    {
      label: "Tomorrow",
      date_str: format_date(tomorrow),
      description: "Tomorrow",
    },
    {
      label: "Yesterday",
      date_str: format_date(yesterday),
      description: "Yesterday",
    },
  ];

  for (let i = 1; i <= 5; i++) {
    const d = next_weekday(today, i);
    const name = DAYS_OF_WEEK[i]!;
    const cap = name[0]!.toUpperCase() + name.slice(1);
    presets.push({
      label: `Next ${cap}`,
      date_str: format_date(d),
      description: `Next ${cap}`,
    });
  }

  return presets;
}
