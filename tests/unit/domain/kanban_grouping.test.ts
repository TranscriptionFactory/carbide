import { describe, it, expect } from "vitest";
import { group_rows_by_property } from "$lib/features/bases/domain/kanban_grouping";
import type { BaseNoteRow } from "$lib/features/bases/ports";
import { as_note_path } from "$lib/shared/types/ids";

function make_row(
  path: string,
  properties: Record<string, string> = {},
): BaseNoteRow {
  return {
    note: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: path.replace(".md", ""),
      title: path.replace(".md", ""),
      blurb: "",
      mtime_ms: 0,
      ctime_ms: 0,
      size_bytes: 0,
      file_type: "markdown",
    },
    properties: Object.fromEntries(
      Object.entries(properties).map(([k, v]) => [
        k,
        { value: v, property_type: "string" },
      ]),
    ),
    tags: [],
    stats: {
      word_count: 0,
      char_count: 0,
      heading_count: 0,
      outlink_count: 0,
      reading_time_secs: 0,
      task_count: 0,
      tasks_done: 0,
      tasks_todo: 0,
      next_due_date: null,
      last_indexed_at: 0,
    },
  };
}

describe("group_rows_by_property", () => {
  it("groups rows by property value", () => {
    const rows = [
      make_row("a.md", { status: "done" }),
      make_row("b.md", { status: "todo" }),
      make_row("c.md", { status: "done" }),
    ];

    const columns = group_rows_by_property(rows, "status");
    expect(columns).toHaveLength(2);
    expect(columns[0]!.value).toBe("done");
    expect(columns[0]!.rows).toHaveLength(2);
    expect(columns[1]!.value).toBe("todo");
    expect(columns[1]!.rows).toHaveLength(1);
  });

  it("puts rows without the property in (unset) column", () => {
    const rows = [
      make_row("a.md", { status: "done" }),
      make_row("b.md", {}),
      make_row("c.md", { status: "" }),
    ];

    const columns = group_rows_by_property(rows, "status");
    const unset = columns.find((c) => c.value === "(unset)");
    expect(unset).toBeDefined();
    expect(unset!.rows).toHaveLength(2);
  });

  it("(unset) column sorts last", () => {
    const rows = [
      make_row("a.md", {}),
      make_row("b.md", { status: "alpha" }),
    ];

    const columns = group_rows_by_property(rows, "status");
    expect(columns[columns.length - 1]!.value).toBe("(unset)");
  });

  it("respects custom column order", () => {
    const rows = [
      make_row("a.md", { status: "done" }),
      make_row("b.md", { status: "todo" }),
      make_row("c.md", { status: "in-progress" }),
    ];

    const columns = group_rows_by_property(rows, "status", [
      "todo",
      "in-progress",
      "done",
    ]);
    expect(columns.map((c) => c.value)).toEqual([
      "todo",
      "in-progress",
      "done",
    ]);
  });

  it("includes empty columns from column_order", () => {
    const rows = [make_row("a.md", { status: "done" })];
    const columns = group_rows_by_property(rows, "status", [
      "todo",
      "done",
      "archived",
    ]);
    expect(columns.map((c) => c.value)).toEqual(["todo", "done", "archived"]);
    expect(columns[0]!.rows).toHaveLength(0);
    expect(columns[2]!.rows).toHaveLength(0);
  });

  it("returns empty array when no rows", () => {
    const columns = group_rows_by_property([], "status");
    expect(columns).toHaveLength(0);
  });
});
