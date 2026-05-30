import { describe, it, expect } from "vitest";
import { group_rows_by_tree } from "$lib/features/bases/domain/tree_grouping";
import type { BaseNoteRow } from "$lib/features/bases/ports";
import { as_note_path } from "$lib/shared/types/ids";

function make_row(
  path: string,
  properties: Record<string, { value: string; property_type?: string }> = {},
  tags: string[] = [],
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
        { value: v.value, property_type: v.property_type ?? "string" },
      ]),
    ),
    tags,
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

describe("group_rows_by_tree", () => {
  it("returns empty tree when no group_by keys are given", () => {
    const rows = [make_row("a.md", { status: { value: "done" } })];
    expect(group_rows_by_tree(rows, [])).toEqual([]);
  });

  it("groups rows by a single property", () => {
    const rows = [
      make_row("a.md", { status: { value: "done" } }),
      make_row("b.md", { status: { value: "todo" } }),
      make_row("c.md", { status: { value: "done" } }),
    ];

    const tree = group_rows_by_tree(rows, ["status"]);
    expect(tree.map((n) => n.label)).toEqual(["done", "todo"]);
    expect(tree[0]!.rows).toHaveLength(2);
    expect(tree[1]!.rows).toHaveLength(1);
  });

  it("nests rows under multi-level group_by", () => {
    const rows = [
      make_row("a.md", {
        area: { value: "work" },
        status: { value: "done" },
      }),
      make_row("b.md", {
        area: { value: "work" },
        status: { value: "todo" },
      }),
      make_row("c.md", {
        area: { value: "home" },
        status: { value: "done" },
      }),
    ];

    const tree = group_rows_by_tree(rows, ["area", "status"]);
    expect(tree.map((n) => n.label)).toEqual(["home", "work"]);
    const work = tree.find((n) => n.label === "work")!;
    expect(work.children.map((c) => c.label)).toEqual(["done", "todo"]);
    expect(work.children[0]!.rows).toHaveLength(1);
  });

  it("emits one node per tag for tag-grouped rows", () => {
    const rows = [
      make_row("a.md", {}, ["work", "urgent"]),
      make_row("b.md", {}, ["urgent"]),
      make_row("c.md", {}, []),
    ];

    const tree = group_rows_by_tree(rows, ["tags"]);
    const labels = tree.map((n) => n.label);
    expect(labels).toContain("work");
    expect(labels).toContain("urgent");
    expect(labels).toContain("(unset)");
    const urgent = tree.find((n) => n.label === "urgent")!;
    expect(urgent.rows).toHaveLength(2);
  });

  it("sorts (unset) last and alpha otherwise", () => {
    const rows = [
      make_row("a.md", { status: { value: "zebra" } }),
      make_row("b.md", {}),
      make_row("c.md", { status: { value: "alpha" } }),
    ];

    const tree = group_rows_by_tree(rows, ["status"]);
    expect(tree.map((n) => n.label)).toEqual(["alpha", "zebra", "(unset)"]);
  });

  it("formats date properties via date_format token", () => {
    const rows = [
      make_row("a.md", {
        created: { value: "2026-05-29T10:00:00Z", property_type: "date" },
      }),
      make_row("b.md", {
        created: { value: "2026-05-01T00:00:00Z", property_type: "date" },
      }),
      make_row("c.md", {
        created: { value: "2025-12-15T00:00:00Z", property_type: "date" },
      }),
    ];

    const tree = group_rows_by_tree(rows, ["created"], "YYYY/MM");
    const labels = tree.map((n) => n.label);
    expect(labels).toContain("2026/05");
    expect(labels).toContain("2025/12");
  });

  it("places missing property values in the (unset) bucket", () => {
    const rows = [
      make_row("a.md", { status: { value: "done" } }),
      make_row("b.md", {}),
      make_row("c.md", { status: { value: "" } }),
    ];

    const tree = group_rows_by_tree(rows, ["status"]);
    const unset = tree.find((n) => n.label === "(unset)");
    expect(unset).toBeDefined();
    expect(unset!.rows).toHaveLength(2);
  });
});
