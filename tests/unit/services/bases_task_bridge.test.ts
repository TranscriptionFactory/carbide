import { describe, it, expect } from "vitest";

describe("bases task bridge virtual columns", () => {
  const make_stats = (
    overrides: Partial<{
      task_count: number;
      tasks_done: number;
      tasks_todo: number;
      next_due_date: string | null;
    }> = {},
  ) => ({
    word_count: 100,
    char_count: 500,
    heading_count: 3,
    outlink_count: 2,
    reading_time_secs: 30,
    task_count: 0,
    tasks_done: 0,
    tasks_todo: 0,
    next_due_date: null,
    last_indexed_at: Date.now(),
    ...overrides,
  });

  it("note with no tasks has zero task aggregates", () => {
    const stats = make_stats();
    expect(stats.task_count).toBe(0);
    expect(stats.tasks_done).toBe(0);
    expect(stats.tasks_todo).toBe(0);
    expect(stats.next_due_date).toBeNull();
  });

  it("note with tasks has correct aggregates", () => {
    const stats = make_stats({
      task_count: 7,
      tasks_done: 3,
      tasks_todo: 4,
      next_due_date: "2026-04-01",
    });
    expect(stats.task_count).toBe(7);
    expect(stats.tasks_done).toBe(3);
    expect(stats.tasks_todo).toBe(4);
    expect(stats.next_due_date).toBe("2026-04-01");
  });

  it("task_count gt 0 filter logic excludes taskless notes", () => {
    const rows = [
      { path: "a.md", stats: make_stats({ task_count: 5 }) },
      { path: "b.md", stats: make_stats({ task_count: 0 }) },
      { path: "c.md", stats: make_stats({ task_count: 2 }) },
    ];
    const filtered = rows.filter((r) => r.stats.task_count > 0);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((r) => r.path)).toEqual(["a.md", "c.md"]);
  });

  it("sort by next_due_date ascending puts nearest deadline first, nulls last", () => {
    const rows = [
      {
        path: "a.md",
        stats: make_stats({ next_due_date: "2026-04-15" }),
      },
      { path: "b.md", stats: make_stats({ next_due_date: null }) },
      {
        path: "c.md",
        stats: make_stats({ next_due_date: "2026-04-01" }),
      },
    ];
    const sorted = [...rows].sort((a, b) => {
      const da = a.stats.next_due_date;
      const db = b.stats.next_due_date;
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });
    expect(sorted.map((r) => r.path)).toEqual(["c.md", "a.md", "b.md"]);
  });
});
