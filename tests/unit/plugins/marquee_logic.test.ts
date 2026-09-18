import { describe, expect, it } from "vitest";
import {
  build_task_filter,
  merge_note_sets,
  normalize_settings,
  parse_tag_list,
  restrict_to_notes,
  select_tasks,
  sort_tasks,
  track_copies,
} from "../../../plugins/marquee/marquee_logic.js";
import type {
  MarqueeSettings,
  Task,
} from "../../../plugins/marquee/marquee_logic.js";

function make_task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    path: "notes/alpha.md",
    text: "pay invoice",
    status: "todo",
    due_date: null,
    line_number: 1,
    section: null,
    ...overrides,
  };
}

function make_settings(
  overrides: Partial<MarqueeSettings> = {},
): MarqueeSettings {
  return { ...normalize_settings({}), ...overrides };
}

describe("normalize_settings", () => {
  it("falls back to defaults for junk input", () => {
    const defaults = {
      status: "open",
      text: "",
      due: "any",
      tags: "",
      base_property: "",
      base_operator: "eq",
      base_value: "",
      show_note_name: true,
      max_items: 40,
      scroll_seconds: 45,
      poll_seconds: 20,
      theme: "auto",
    };

    expect(normalize_settings(null)).toEqual(defaults);
    expect(normalize_settings(undefined)).toEqual(defaults);
    expect(normalize_settings("nonsense")).toEqual(defaults);
    expect(
      normalize_settings({
        task_status: "nonsense",
        task_text: 42,
        task_due: "yesterday",
        tags: null,
        base_operator: "resembles",
        show_note_name: "yes",
        max_items: "80",
        scroll_seconds: Number.NaN,
        poll_seconds: Number.POSITIVE_INFINITY,
        theme: "sepia",
      }),
    ).toEqual(defaults);
  });

  it("reads values stored under their manifest keys", () => {
    const settings = normalize_settings({
      task_status: "doing",
      task_text: "invoice",
      task_due: "overdue",
      tags: "Work",
      base_property: "status",
      base_operator: "not_contains",
      base_value: "parked",
      show_note_name: false,
      max_items: 12,
      scroll_seconds: 90,
      poll_seconds: 30,
      theme: "dark",
    });

    expect(settings).toEqual({
      status: "doing",
      text: "invoice",
      due: "overdue",
      tags: "Work",
      base_property: "status",
      base_operator: "not_contains",
      base_value: "parked",
      show_note_name: false,
      max_items: 12,
      scroll_seconds: 90,
      poll_seconds: 30,
      theme: "dark",
    });
  });

  it("clamps numeric settings to their supported range", () => {
    expect(normalize_settings({ max_items: 0 }).max_items).toBe(1);
    expect(normalize_settings({ max_items: 999 }).max_items).toBe(200);
    expect(normalize_settings({ scroll_seconds: 5 }).scroll_seconds).toBe(10);
    expect(normalize_settings({ scroll_seconds: 5000 }).scroll_seconds).toBe(
      600,
    );
    expect(normalize_settings({ poll_seconds: 5 }).poll_seconds).toBe(15);
    expect(normalize_settings({ poll_seconds: 5000 }).poll_seconds).toBe(600);
    expect(normalize_settings({ max_items: 12.7 }).max_items).toBe(12);
  });
});

describe("parse_tag_list", () => {
  it("strips hashes, blanks and surrounding whitespace", () => {
    expect(parse_tag_list("Work, #urgent ,, ")).toEqual(["Work", "urgent"]);
    expect(parse_tag_list("#a,#b")).toEqual(["a", "b"]);
    expect(parse_tag_list("  # spaced  ")).toEqual(["spaced"]);
  });

  it("returns nothing for empty or non-string input", () => {
    expect(parse_tag_list("")).toEqual([]);
    expect(parse_tag_list(",")).toEqual([]);
    expect(parse_tag_list(null)).toEqual([]);
    expect(parse_tag_list(["Work"])).toEqual([]);
  });
});

describe("build_task_filter", () => {
  it("excludes done tasks by default", () => {
    expect(build_task_filter(make_settings())).toEqual({
      type: "atom",
      filter: { property: "status", operator: "neq", value: "done" },
    });
  });

  it("drops the status atom when every status is allowed", () => {
    expect(build_task_filter(make_settings({ status: "all" }))).toBeNull();
  });

  it("maps each status to its own atom", () => {
    expect(build_task_filter(make_settings({ status: "todo" }))).toEqual({
      type: "atom",
      filter: { property: "status", operator: "eq", value: "todo" },
    });
    expect(build_task_filter(make_settings({ status: "doing" }))).toEqual({
      type: "atom",
      filter: { property: "status", operator: "eq", value: "doing" },
    });
    expect(build_task_filter(make_settings({ status: "done" }))).toEqual({
      type: "atom",
      filter: { property: "status", operator: "eq", value: "done" },
    });
  });

  it("maps the due-date windows to date sentinels", () => {
    expect(build_task_filter(make_settings({ due: "overdue" }))).toEqual({
      type: "and",
      operands: [
        {
          type: "atom",
          filter: { property: "status", operator: "neq", value: "done" },
        },
        {
          type: "atom",
          filter: { property: "due_date", operator: "lt", value: "__today__" },
        },
      ],
    });
    expect(
      build_task_filter(make_settings({ status: "all", due: "today" })),
    ).toEqual({
      type: "atom",
      filter: { property: "due_date", operator: "eq", value: "__today__" },
    });
  });

  it("nests the seven-day window and keeps source order", () => {
    expect(
      build_task_filter(
        make_settings({ status: "todo", text: "invoice", due: "next_7_days" }),
      ),
    ).toEqual({
      type: "and",
      operands: [
        {
          type: "atom",
          filter: { property: "status", operator: "eq", value: "todo" },
        },
        {
          type: "atom",
          filter: { property: "text", operator: "contains", value: "invoice" },
        },
        {
          type: "and",
          operands: [
            {
              type: "atom",
              filter: {
                property: "due_date",
                operator: "gte",
                value: "__today__",
              },
            },
            {
              type: "atom",
              filter: {
                property: "due_date",
                operator: "lte",
                value: "__today_plus_7__",
              },
            },
          ],
        },
      ],
    });
  });
});

describe("merge_note_sets", () => {
  it("intersects every supplied note set", () => {
    expect(
      merge_note_sets([
        ["notes/a.md", "notes/b.md"],
        ["notes/b.md", "notes/c.md"],
      ]),
    ).toEqual(new Set(["notes/b.md"]));
  });

  it("ignores unconstrained sources", () => {
    expect(merge_note_sets([null, ["notes/a.md"], undefined])).toEqual(
      new Set(["notes/a.md"]),
    );
  });

  it("returns nothing to restrict on when no source is constrained", () => {
    expect(merge_note_sets([])).toBeNull();
    expect(merge_note_sets([null, undefined])).toBeNull();
  });

  it("keeps an empty set as a real (empty) constraint", () => {
    expect(merge_note_sets([[]])).toEqual(new Set());
  });
});

describe("restrict_to_notes", () => {
  const tasks = [
    make_task({ id: "a", path: "notes/alpha.md" }),
    make_task({ id: "b", path: "notes/beta.md" }),
  ];

  it("passes tasks through untouched without a constraint", () => {
    expect(restrict_to_notes(tasks, null)).toBe(tasks);
  });

  it("keeps only tasks in the constrained notes", () => {
    expect(
      restrict_to_notes(tasks, new Set(["notes/beta.md"])).map((t) => t.id),
    ).toEqual(["b"]);
  });

  it("drops every task for an empty constraint", () => {
    expect(restrict_to_notes(tasks, new Set())).toEqual([]);
  });
});

describe("sort_tasks", () => {
  it("orders by due date, then path, then line, with undated tasks last", () => {
    const later = make_task({
      id: "later",
      path: "notes/alpha.md",
      due_date: "2026-03-01",
      line_number: 4,
    });
    const earliest = make_task({
      id: "earliest",
      path: "notes/beta.md",
      due_date: "2026-01-02",
      line_number: 8,
    });
    const second_line = make_task({
      id: "second_line",
      path: "notes/alpha.md",
      due_date: "2026-01-05",
      line_number: 9,
    });
    const first_line = make_task({
      id: "first_line",
      path: "notes/alpha.md",
      due_date: "2026-01-05",
      line_number: 3,
    });
    const undated = make_task({ id: "undated", path: "notes/aaa.md" });

    const input = [undated, later, second_line, earliest, first_line];

    expect(sort_tasks(input).map((t) => t.id)).toEqual([
      "earliest",
      "first_line",
      "second_line",
      "later",
      "undated",
    ]);
    expect(input.map((t) => t.id)).toEqual([
      "undated",
      "later",
      "second_line",
      "earliest",
      "first_line",
    ]);
  });
});

describe("select_tasks", () => {
  const dated = make_task({
    id: "dated",
    path: "notes/alpha.md",
    due_date: "2026-03-01",
  });
  const overdue = make_task({
    id: "overdue",
    path: "notes/beta.md",
    due_date: "2026-01-02",
  });
  const undated = make_task({ id: "undated", path: "notes/alpha.md" });
  const tasks = [dated, undated, overdue];

  it("restricts to the note set before ranking", () => {
    expect(
      select_tasks(tasks, new Set(["notes/alpha.md"]), 5).map((t) => t.id),
    ).toEqual(["dated", "undated"]);
  });

  it("counts the row cap against the ranked pool", () => {
    expect(select_tasks(tasks, null, 1).map((t) => t.id)).toEqual(["overdue"]);
  });
});

describe("track_copies", () => {
  it("keeps two copies when one group already overflows the viewport", () => {
    expect(track_copies(600, 400)).toBe(2);
  });

  it("adds copies until the copies after the first cover the viewport", () => {
    expect(track_copies(100, 400)).toBe(5);
    expect(track_copies(100, 401)).toBe(6);
    expect(track_copies(150, 400)).toBe(4);
  });

  it("falls back to two copies before the group has a layout height", () => {
    expect(track_copies(0, 400)).toBe(2);
  });
});
