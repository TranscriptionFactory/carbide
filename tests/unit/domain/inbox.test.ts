import { describe, it, expect } from "vitest";
import {
  build_inbox_query,
  default_direction,
  type InboxPeriod,
  type InboxSort,
  type SortDirection,
} from "$lib/features/folder/domain/inbox";

const NOW_MS = 1_700_000_000_000;
const DAY_MS = 86_400_000;
const LIMIT = 200;

const PERIOD_DAYS: Record<Exclude<InboxPeriod, "all">, number> = {
  week: 7,
  month: 30,
  quarter: 90,
};

const SORT_PROPERTY: Record<InboxSort, string> = {
  modified: "modified",
  created: "created",
  title: "title",
};

const SORTS: InboxSort[] = ["modified", "created", "title"];
const DIRECTIONS: SortDirection[] = ["asc", "desc"];
const PERIODS: InboxPeriod[] = ["all", "week", "month", "quarter"];

describe("default_direction", () => {
  it("defaults time-based sorts to descending", () => {
    expect(default_direction("modified")).toBe("desc");
    expect(default_direction("created")).toBe("desc");
  });

  it("defaults title sort to ascending", () => {
    expect(default_direction("title")).toBe("asc");
  });
});

describe("build_inbox_query", () => {
  it("maps every sort option to the matching bases property", () => {
    for (const sort of SORTS) {
      const query = build_inbox_query({
        sort,
        direction: "desc",
        period: "all",
        now_ms: NOW_MS,
        limit: LIMIT,
      });
      expect(query.sort).toEqual([
        { property: SORT_PROPERTY[sort], descending: true },
      ]);
    }
  });

  it("maps direction to the descending flag for every sort", () => {
    for (const sort of SORTS) {
      for (const direction of DIRECTIONS) {
        const query = build_inbox_query({
          sort,
          direction,
          period: "all",
          now_ms: NOW_MS,
          limit: LIMIT,
        });
        expect(query.sort[0]?.descending).toBe(direction === "desc");
      }
    }
  });

  it("emits no filter for the 'all' period", () => {
    for (const sort of SORTS) {
      const query = build_inbox_query({
        sort,
        direction: default_direction(sort),
        period: "all",
        now_ms: NOW_MS,
        limit: LIMIT,
      });
      expect(query.filters).toEqual([]);
    }
  });

  it("emits a created>=cutoff filter with correct window math per period", () => {
    for (const period of ["week", "month", "quarter"] as const) {
      const query = build_inbox_query({
        sort: "modified",
        direction: "desc",
        period,
        now_ms: NOW_MS,
        limit: LIMIT,
      });
      const cutoff = NOW_MS - PERIOD_DAYS[period] * DAY_MS;
      expect(query.filters).toEqual([
        { property: "created", operator: "gte", value: String(cutoff) },
      ]);
    }
  });

  it("applies limit and pins offset to zero across all combinations", () => {
    for (const sort of SORTS) {
      for (const direction of DIRECTIONS) {
        for (const period of PERIODS) {
          const query = build_inbox_query({
            sort,
            direction,
            period,
            now_ms: NOW_MS,
            limit: LIMIT,
          });
          expect(query.limit).toBe(LIMIT);
          expect(query.offset).toBe(0);
        }
      }
    }
  });

  it("is deterministic under an injected now_ms", () => {
    const a = build_inbox_query({
      sort: "created",
      direction: "asc",
      period: "quarter",
      now_ms: NOW_MS,
      limit: 50,
    });
    const b = build_inbox_query({
      sort: "created",
      direction: "asc",
      period: "quarter",
      now_ms: NOW_MS,
      limit: 50,
    });
    expect(a).toEqual(b);
    expect(a.filters[0]?.value).toBe(String(NOW_MS - 90 * DAY_MS));
  });
});
