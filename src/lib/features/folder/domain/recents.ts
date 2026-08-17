import type { BaseFilter, BaseQuery, BaseSort } from "$lib/features/bases";
import type {
  RecentsPeriod,
  RecentsSort,
  SortDirection,
} from "$lib/shared/types/editor_settings";

export type { RecentsPeriod, RecentsSort, SortDirection };

const DAY_MS = 86_400_000;

/* "today" is a calendar boundary rather than a rolling window, so it is
   excluded here instead of being given a day count it cannot express. */
const PERIOD_WINDOW_DAYS: Record<
  Exclude<RecentsPeriod, "all" | "today">,
  number
> = {
  week: 7,
  month: 30,
  quarter: 90,
};

const SORT_PROPERTY: Record<RecentsSort, string> = {
  modified: "modified",
  created: "created",
  title: "title",
};

export const NOTE_FILE_TYPES = ["markdown", "canvas"] as const;

export function default_direction(sort: RecentsSort): SortDirection {
  return sort === "title" ? "asc" : "desc";
}

function start_of_local_day(now_ms: number): number {
  const midnight = new Date(now_ms);
  midnight.setHours(0, 0, 0, 0);
  return midnight.getTime();
}

function period_cutoff_ms(
  period: Exclude<RecentsPeriod, "all">,
  now_ms: number,
): number {
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
    filters.push({
      property: period_filter_property(sort),
      operator: "gte",
      value: String(period_cutoff_ms(period, now_ms)),
    });
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
