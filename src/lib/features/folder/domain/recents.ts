import type { BaseFilter, BaseQuery, BaseSort } from "$lib/features/bases";
import {
  coerce_recents_period,
  RECENTS_CUSTOM_PREFIX,
  type RecentsPeriod,
  type RecentsSort,
  type SortDirection,
} from "$lib/shared/types/editor_settings";

export type { RecentsPeriod, RecentsSort, SortDirection };
export { coerce_recents_period };

const DAY_MS = 86_400_000;

type PresetRecentsPeriod = Exclude<
  RecentsPeriod,
  "all" | `${typeof RECENTS_CUSTOM_PREFIX}${string}`
>;

/* "today" is a calendar boundary rather than a rolling window, so it is
   excluded here instead of being given a day count it cannot express. */
const PERIOD_WINDOW_DAYS: Record<
  Exclude<PresetRecentsPeriod, "today">,
  number
> = {
  week: 7,
  month: 30,
};

const SORT_PROPERTY: Record<RecentsSort, string> = {
  modified: "modified",
  created: "created",
  title: "title",
};

export const NOTE_FILE_TYPES = ["markdown", "canvas"] as const;

export type RecentsDateRange = {
  start_day: string;
  end_day: string;
  start_ms: number;
  end_ms: number;
};

export function default_direction(sort: RecentsSort): SortDirection {
  return sort === "title" ? "asc" : "desc";
}

function start_of_local_day(now_ms: number): number {
  const midnight = new Date(now_ms);
  midnight.setHours(0, 0, 0, 0);
  return midnight.getTime();
}

function is_custom_period(
  period: RecentsPeriod,
): period is `${typeof RECENTS_CUSTOM_PREFIX}${string}` {
  return period.startsWith(RECENTS_CUSTOM_PREFIX);
}

/* Rejects dates the Date constructor rolls over (2026-02-31) as well as any
   other shape, so a malformed encoded day can never reach the query as NaN. */
function local_day_ms(day: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const parsed = new Date(year, month - 1, date);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== date
  ) {
    return null;
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed.getTime();
}

export function custom_recents_period(
  start_day: string,
  end_day: string,
): RecentsPeriod {
  return `${RECENTS_CUSTOM_PREFIX}${start_day}..${end_day}`;
}

/* Both encoded days are inclusive; the upper bound is the last millisecond of
   the end day, so `lte` includes that day whole. A reversed pair is read as the
   range between the two days rather than as an empty one. */
export function parse_custom_date_range(
  period: RecentsPeriod,
): RecentsDateRange | null {
  if (!is_custom_period(period)) return null;
  const days = period.slice(RECENTS_CUSTOM_PREFIX.length).split("..");
  if (days.length !== 2) return null;
  const [first_day = "", second_day = ""] = days;
  const first_ms = local_day_ms(first_day);
  const second_ms = local_day_ms(second_day);
  if (first_ms === null || second_ms === null) return null;
  const reversed = first_ms > second_ms;
  const start_day = reversed ? second_day : first_day;
  const end_day = reversed ? first_day : second_day;
  const end_day_ms = reversed ? first_ms : second_ms;
  const after_end = new Date(end_day_ms);
  after_end.setDate(after_end.getDate() + 1);
  return {
    start_day,
    end_day,
    start_ms: reversed ? second_ms : first_ms,
    end_ms: after_end.getTime() - 1,
  };
}

function period_cutoff_ms(period: PresetRecentsPeriod, now_ms: number): number {
  if (period === "today") return start_of_local_day(now_ms);
  return now_ms - PERIOD_WINDOW_DAYS[period] * DAY_MS;
}

/* The period window has to constrain the same column the list is ordered by,
   or a note created months ago but edited today drops out of "Today". Title is
   not a timestamp, so a time-windowed comparison against it would be valid SQL
   over the wrong column; recency falls back to modified. */
function period_filter_property(sort: RecentsSort): string {
  return sort === "title" ? "modified" : SORT_PROPERTY[sort];
}

type BuildRecentsQueryInput = {
  sort: RecentsSort;
  direction: SortDirection;
  period: RecentsPeriod;
  show_non_markdown: boolean;
  now_ms: number;
  limit: number;
};

export function build_recents_query({
  sort,
  direction,
  period,
  show_non_markdown,
  now_ms,
  limit,
}: BuildRecentsQueryInput): BaseQuery {
  const base_sort: BaseSort = {
    property: SORT_PROPERTY[sort],
    descending: direction === "desc",
  };

  const filters: BaseFilter[] = [];
  if (period !== "all") {
    const property = period_filter_property(sort);
    if (is_custom_period(period)) {
      const range = parse_custom_date_range(period);
      if (range) {
        filters.push({
          property,
          operator: "gte",
          value: String(range.start_ms),
        });
        filters.push({
          property,
          operator: "lte",
          value: String(range.end_ms),
        });
      }
    } else {
      filters.push({
        property,
        operator: "gte",
        value: String(period_cutoff_ms(period, now_ms)),
      });
    }
  }
  if (!show_non_markdown) {
    filters.push({
      property: "file_type",
      operator: "in",
      value: NOTE_FILE_TYPES.join(","),
    });
  }

  return {
    filters,
    sort: [base_sort],
    limit,
    offset: 0,
  };
}
