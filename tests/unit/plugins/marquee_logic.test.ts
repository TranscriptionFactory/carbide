import { describe, expect, it } from "vitest";
import {
  build_rows,
  build_section_filter,
  build_task_filter,
  merge_note_sets,
  normalize_settings,
  parse_tag_list,
  restrict_rows,
  row_open_payload,
  select_rows,
  sort_rows,
  track_copies,
} from "../../../plugins/marquee/marquee_logic.js";
import type {
  MarqueeRow,
  MarqueeSettings,
  SectionHit,
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

function make_row(overrides: Partial<MarqueeRow> = {}): MarqueeRow {
  return {
    kind: "task",
    id: "task-1",
    path: "notes/alpha.md",
    text: "pay invoice",
    status: "todo",
    due_date: null,
    line_number: 1,
    heading_path: null,
    level: null,
    ...overrides,
  };
}

function make_section(overrides: Partial<SectionHit> = {}): SectionHit {
  return {
    note: { path: "notes/alpha.md" },
    heading_id: "h-2-details-0",
    title: "Details",
    level: 2,
    heading_path: "Intro/Details",
    start_line: 4,
    end_line: 9,
    word_count: 5,
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
      section_title: "",
      section_level: "any",
      section_under: "",
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
        section_title: 42,
        section_level: "9",
        section_under: null,
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
      section_title: "draft",
      section_level: "2",
      section_under: "Project A",
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
      section_title: "draft",
      section_level: "2",
      section_under: "Project A",
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

describe("build_section_filter", () => {
  it("stays off until a section setting is set", () => {
    expect(build_section_filter(make_settings())).toBeNull();
  });

  it("sends the structured filter the sections RPC takes", () => {
    expect(
      build_section_filter(
        make_settings({
          section_title: "draft",
          section_level: "2",
          section_under: "Project A",
        }),
      ),
    ).toEqual({
      title: "draft",
      level_min: 2,
      level_max: 2,
      heading_path_under: "Project A",
      limit: 200,
    });
  });

  it("omits the fields the panel leaves empty", () => {
    expect(
      build_section_filter(make_settings({ section_under: "Project A" })),
    ).toEqual({ heading_path_under: "Project A", limit: 200 });
    expect(build_section_filter(make_settings({ section_level: "1" }))).toEqual(
      { level_min: 1, level_max: 1, limit: 200 },
    );
  });
});

describe("build_rows", () => {
  it("normalizes both pools into one row shape", () => {
    const rows = build_rows(
      [make_task({ id: "t1", line_number: 7 })],
      [make_section({ heading_id: "h-2-details-0", start_line: 12 })],
    );

    expect(rows).toEqual([
      {
        kind: "task",
        id: "t1",
        path: "notes/alpha.md",
        text: "pay invoice",
        status: "todo",
        due_date: null,
        line_number: 7,
        heading_path: null,
        level: null,
      },
      {
        kind: "section",
        id: "h-2-details-0",
        path: "notes/alpha.md",
        text: "Details",
        status: null,
        due_date: null,
        line_number: 12,
        heading_path: "Intro/Details",
        level: 2,
      },
    ]);
  });
});

describe("row_open_payload", () => {
  it("opens a task at its note and nothing else", () => {
    const payload = row_open_payload(make_row({ path: "notes/alpha.md" }));

    expect(payload).toEqual({ note_path: "notes/alpha.md" });
    expect("line" in payload).toBe(false);
  });

  it("opens a section at the heading's own 0-based line", () => {
    expect(
      row_open_payload(
        make_row({ kind: "section", path: "notes/beta.md", line_number: 12 }),
      ),
    ).toEqual({ note_path: "notes/beta.md", line: 12 });
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

describe("restrict_rows", () => {
  const rows = [
    make_row({ id: "a", path: "notes/alpha.md" }),
    make_row({ id: "b", path: "notes/beta.md" }),
  ];

  it("passes rows through untouched without a constraint", () => {
    expect(restrict_rows(rows, null)).toBe(rows);
  });

  it("keeps only rows in the constrained notes", () => {
    expect(
      restrict_rows(rows, new Set(["notes/beta.md"])).map((r) => r.id),
    ).toEqual(["b"]);
  });

  it("drops every row for an empty constraint", () => {
    expect(restrict_rows(rows, new Set())).toEqual([]);
  });
});

describe("sort_rows", () => {
  it("orders by due date, then path, then line, with undated tasks last", () => {
    const later = make_row({
      id: "later",
      path: "notes/alpha.md",
      due_date: "2026-03-01",
      line_number: 4,
    });
    const earliest = make_row({
      id: "earliest",
      path: "notes/beta.md",
      due_date: "2026-01-02",
      line_number: 8,
    });
    const second_line = make_row({
      id: "second_line",
      path: "notes/alpha.md",
      due_date: "2026-01-05",
      line_number: 9,
    });
    const first_line = make_row({
      id: "first_line",
      path: "notes/alpha.md",
      due_date: "2026-01-05",
      line_number: 3,
    });
    const undated = make_row({ id: "undated", path: "notes/aaa.md" });

    const input = [undated, later, second_line, earliest, first_line];

    expect(sort_rows(input).map((r) => r.id)).toEqual([
      "earliest",
      "first_line",
      "second_line",
      "later",
      "undated",
    ]);
    expect(input.map((r) => r.id)).toEqual([
      "undated",
      "later",
      "second_line",
      "earliest",
      "first_line",
    ]);
  });

  it("sinks section rows into the same order after the dated tasks", () => {
    const rows = build_rows(
      [
        make_task({
          id: "beta",
          path: "notes/beta.md",
          due_date: "2026-03-01",
          line_number: 2,
        }),
        make_task({
          id: "alpha",
          path: "notes/alpha.md",
          due_date: "2026-01-02",
          line_number: 5,
        }),
      ],
      [
        make_section({ heading_id: "alpha-h2", start_line: 0 }),
        make_section({
          heading_id: "aaa-h1",
          note: { path: "notes/aaa.md" },
          level: 1,
          start_line: 4,
        }),
      ],
    );

    expect(
      sort_rows(rows).map((row) =>
        [row.kind, row.path, row.line_number].join(":"),
      ),
    ).toEqual([
      "task:notes/alpha.md:5",
      "task:notes/beta.md:2",
      "section:notes/aaa.md:4",
      "section:notes/alpha.md:0",
    ]);
  });
});

describe("select_rows", () => {
  const dated = make_row({
    id: "dated",
    path: "notes/alpha.md",
    due_date: "2026-03-01",
  });
  const overdue = make_row({
    id: "overdue",
    path: "notes/beta.md",
    due_date: "2026-01-02",
  });
  const undated = make_row({ id: "undated", path: "notes/alpha.md" });
  const rows = [dated, undated, overdue];

  it("restricts to the note set before ranking", () => {
    expect(
      select_rows(rows, new Set(["notes/alpha.md"]), 5).map((r) => r.id),
    ).toEqual(["dated", "undated"]);
  });

  it("counts the row cap against the ranked pool", () => {
    expect(select_rows(rows, null, 1).map((r) => r.id)).toEqual(["overdue"]);
  });

  it("restricts tasks and sections by the same note set", () => {
    const mixed = build_rows(
      [
        make_task({
          id: "task-keep",
          path: "notes/alpha.md",
          due_date: "2026-01-02",
        }),
      ],
      [
        make_section({ heading_id: "section-keep", start_line: 0 }),
        make_section({
          heading_id: "section-drop",
          note: { path: "notes/beta.md" },
        }),
      ],
    );

    expect(
      select_rows(mixed, new Set(["notes/alpha.md"]), 5).map((r) => r.id),
    ).toEqual(["task-keep", "section-keep"]);
  });

  it("reserves slots for sections behind a wall of dated tasks", () => {
    const tasks = Array.from({ length: 50 }, (_, i) =>
      make_task({
        id: `task-${i}`,
        line_number: i,
        due_date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
      }),
    );
    const sections = Array.from({ length: 3 }, (_, i) =>
      make_section({ heading_id: `section-${i}`, start_line: 100 + i }),
    );

    const selected = select_rows(build_rows(tasks, sections), null, 40);

    expect(selected).toHaveLength(40);
    expect(
      selected.filter((r) => r.kind === "section").map((r) => r.id),
    ).toEqual(["section-0", "section-1", "section-2"]);
    expect(selected.filter((r) => r.kind === "task")).toHaveLength(37);
    expect(selected.map((r) => r.id)).toEqual(
      sort_rows(selected).map((r) => r.id),
    );
  });

  it("caps sections at half the row budget", () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      make_task({ id: `task-${i}`, line_number: i, due_date: "2026-01-02" }),
    );
    const sections = Array.from({ length: 10 }, (_, i) =>
      make_section({ heading_id: `section-${i}`, start_line: 100 + i }),
    );

    const selected = select_rows(build_rows(tasks, sections), null, 5);

    expect(selected.filter((r) => r.kind === "section")).toHaveLength(2);
    expect(selected.filter((r) => r.kind === "task")).toHaveLength(3);
  });

  it("leaves a task-only pool unchanged", () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      make_task({ id: `task-${i}`, line_number: i, due_date: "2026-01-02" }),
    );

    expect(
      select_rows(build_rows(tasks, []), null, 4).map((r) => r.id),
    ).toEqual(
      sort_rows(build_rows(tasks, []))
        .slice(0, 4)
        .map((r) => r.id),
    );
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
