import type { BaseFilter, BaseQuery, BaseSort } from "$lib/features/bases";
import type {
  RecentsPeriod,
  RecentsSort,
  SortDirection,
} from "$lib/shared/types/editor_settings";

export type { RecentsPeriod, RecentsSort, SortDirection };

const DAY_MS = 86_400_000;

const PERIOD_WINDOW_DAYS: Record<Exclude<RecentsPeriod, "all">, number> = {
  week: 7,
  month: 30,
  quarter: 90,
};

const SORT_PROPERTY: Record<RecentsSort, string> = {
  modified: "modified",
  created: "created",
  title: "title",
};

export function default_direction(sort: RecentsSort): SortDirection {
  return sort === "title" ? "asc" : "desc";
}

type BuildRecentsQueryInput = {
  sort: RecentsSort;
  direction: SortDirection;
  period: RecentsPeriod;
  now_ms: number;
  limit: number;
};

export function build_recents_query({
  sort,
  direction,
  period,
  now_ms,
  limit,
}: BuildRecentsQueryInput): BaseQuery {
  const base_sort: BaseSort = {
    property: SORT_PROPERTY[sort],
    descending: direction === "desc",
  };

  const filters: BaseFilter[] = [];
  if (period !== "all") {
    const cutoff_ms = now_ms - PERIOD_WINDOW_DAYS[period] * DAY_MS;
    filters.push({
      property: "created",
      operator: "gte",
      value: String(cutoff_ms),
    });
  }

  return {
    filters,
    sort: [base_sort],
    limit,
    offset: 0,
  };
}
