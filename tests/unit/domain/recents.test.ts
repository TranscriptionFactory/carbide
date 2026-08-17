import { describe, it, expect } from "vitest";
import {
  build_recents_query,
  default_direction,
  NOTE_FILE_TYPES,
  type RecentsPeriod,
  type RecentsSort,
  type SortDirection,
} from "$lib/features/folder/domain/recents";

const NOW_MS = 1_700_000_000_000;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const LIMIT = 200;

const PERIOD_DAYS: Record<Exclude<RecentsPeriod, "all" | "today">, number> = {
  week: 7,
  month: 30,
  quarter: 90,
};

const SORT_PROPERTY: Record<RecentsSort, string> = {
  modified: "modified",
  created: "created",
  title: "title",
};

const SORTS: RecentsSort[] = ["modified", "created", "title"];
const DIRECTIONS: SortDirection[] = ["asc", "desc"];
const PERIODS: RecentsPeriod[] = ["all", "today", "week", "month", "quarter"];

describe("default_direction", () => {
  it("defaults time-based sorts to descending", () => {
    expect(default_direction("modified")).toBe("desc");
    expect(default_direction("created")).toBe("desc");
  });

  it("defaults title sort to ascending", () => {
    expect(default_direction("title")).toBe("asc");
  });
});

describe("build_recents_query", () => {
  it("maps every sort option to the matching bases property", () => {
    for (const sort of SORTS) {
      const query = build_recents_query({
        sort,
        direction: "desc",
        period: "all",
        show_non_markdown: true,
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
        const query = build_recents_query({
          sort,
          direction,
          period: "all",
          show_non_markdown: true,
          now_ms: NOW_MS,
          limit: LIMIT,
        });
        expect(query.sort[0]?.descending).toBe(direction === "desc");
      }
    }
  });

  it("emits no filter for the 'all' period", () => {
    for (const sort of SORTS) {
      const query = build_recents_query({
        sort,
        direction: default_direction(sort),
        period: "all",
        show_non_markdown: true,
        now_ms: NOW_MS,
        limit: LIMIT,
      });
      expect(query.filters).toEqual([]);
    }
  });

  it("emits a sorted-column>=cutoff filter with correct window math per period", () => {
    for (const period of ["week", "month", "quarter"] as const) {
      const query = build_recents_query({
        sort: "modified",
        direction: "desc",
        period,
        show_non_markdown: true,
        now_ms: NOW_MS,
        limit: LIMIT,
      });
      const cutoff = NOW_MS - PERIOD_DAYS[period] * DAY_MS;
      expect(query.filters).toEqual([
        { property: "modified", operator: "gte", value: String(cutoff) },
      ]);
    }
  });

  it("windows the same column it sorts by, so a note edited today survives a 'today' window whatever its created date", () => {
    const query = build_recents_query({
      sort: "modified",
      direction: "desc",
      period: "today",
      show_non_markdown: true,
      now_ms: NOW_MS,
      limit: LIMIT,
    });
    expect(query.filters[0]?.property).toBe("modified");
  });

  it("windows created when created is the sort", () => {
    const query = build_recents_query({
      sort: "created",
      direction: "desc",
      period: "today",
      show_non_markdown: true,
      now_ms: NOW_MS,
      limit: LIMIT,
    });
    expect(query.filters[0]?.property).toBe("created");
  });

  it("falls back to modified when sorting by title, never windowing a non-timestamp column", () => {
    for (const period of ["today", "week", "month", "quarter"] as const) {
      const query = build_recents_query({
        sort: "title",
        direction: "asc",
        period,
        show_non_markdown: true,
        now_ms: NOW_MS,
        limit: LIMIT,
      });
      expect(query.filters[0]?.property).toBe("modified");
      expect(query.filters.map((f) => f.property)).not.toContain("title");
    }
  });

  it("applies limit and pins offset to zero across all combinations", () => {
    for (const sort of SORTS) {
      for (const direction of DIRECTIONS) {
        for (const period of PERIODS) {
          const query = build_recents_query({
            sort,
            direction,
            period,
            show_non_markdown: true,
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
    const a = build_recents_query({
      sort: "created",
      direction: "asc",
      period: "quarter",
      show_non_markdown: true,
      now_ms: NOW_MS,
      limit: 50,
    });
    const b = build_recents_query({
      sort: "created",
      direction: "asc",
      period: "quarter",
      show_non_markdown: true,
      now_ms: NOW_MS,
      limit: 50,
    });
    expect(a).toEqual(b);
    expect(a.filters[0]?.value).toBe(String(NOW_MS - 90 * DAY_MS));
  });
});

/* Constructed through the local Date ctor so the expected boundary is the same
   local midnight the implementation computes, in whatever zone the suite runs. */
describe("build_recents_query — the 'today' period", () => {
  const TWO_AM = new Date(2023, 10, 14, 2, 0, 0, 0).getTime();
  const LOCAL_MIDNIGHT = new Date(2023, 10, 14, 0, 0, 0, 0).getTime();

  function today_query(sort: RecentsSort = "modified") {
    return build_recents_query({
      sort,
      direction: "desc",
      period: "today",
      show_non_markdown: true,
      now_ms: TWO_AM,
      limit: LIMIT,
    });
  }

  it("cuts off at local midnight rather than a rolling 24-hour window", () => {
    expect(today_query().filters[0]?.value).toBe(String(LOCAL_MIDNIGHT));
  });

  it("excludes a file touched 23 hours ago when that lands on yesterday", () => {
    const twenty_three_hours_ago = TWO_AM - 23 * HOUR_MS;
    const cutoff = Number(today_query().filters[0]?.value);

    expect(cutoff).toBeGreaterThan(twenty_three_hours_ago);
    expect(new Date(twenty_three_hours_ago).getDate()).toBe(13);
  });

  it("lands on a midnight boundary in local time", () => {
    const cutoff = new Date(Number(today_query().filters[0]?.value));

    expect([
      cutoff.getHours(),
      cutoff.getMinutes(),
      cutoff.getSeconds(),
      cutoff.getMilliseconds(),
    ]).toEqual([0, 0, 0, 0]);
  });

  it("keeps a note created earlier but modified today, by windowing modified", () => {
    const query = today_query("modified");

    expect(query.filters).toEqual([
      {
        property: "modified",
        operator: "gte",
        value: String(LOCAL_MIDNIGHT),
      },
    ]);
  });
});

describe("build_recents_query — the non-markdown toggle", () => {
  it("adds no file_type filter while non-markdown files are shown", () => {
    const query = build_recents_query({
      sort: "modified",
      direction: "desc",
      period: "all",
      show_non_markdown: true,
      now_ms: NOW_MS,
      limit: LIMIT,
    });

    expect(query.filters).toEqual([]);
  });

  it("restricts file_type to the note kinds when non-markdown files are hidden", () => {
    const query = build_recents_query({
      sort: "modified",
      direction: "desc",
      period: "all",
      show_non_markdown: false,
      now_ms: NOW_MS,
      limit: LIMIT,
    });

    expect(query.filters).toEqual([
      { property: "file_type", operator: "in", value: "markdown,canvas" },
    ]);
  });

  it("keeps canvas files, which are notes rather than attachments", () => {
    expect(NOTE_FILE_TYPES).toContain("canvas");
    expect(NOTE_FILE_TYPES).toContain("markdown");
  });

  it("combines the period window and the file_type filter", () => {
    const query = build_recents_query({
      sort: "modified",
      direction: "desc",
      period: "week",
      show_non_markdown: false,
      now_ms: NOW_MS,
      limit: LIMIT,
    });

    expect(query.filters).toEqual([
      {
        property: "modified",
        operator: "gte",
        value: String(NOW_MS - 7 * DAY_MS),
      },
      { property: "file_type", operator: "in", value: "markdown,canvas" },
    ]);
  });
});
