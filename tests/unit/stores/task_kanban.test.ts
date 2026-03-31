import { describe, it, expect } from "vitest";
import { derive_kanban_columns } from "$lib/features/task/ui/kanban_view.svelte";
import type { Task, TaskStatus } from "$lib/features/task/types";

type KanbanColumn = {
  id: string;
  label: string;
  status: TaskStatus | undefined;
  tasks: Task[];
};
type DeriveKanbanColumns = (
  tasks: Task[],
  group_property: string,
) => KanbanColumn[];

const derive_kanban_columns_typed =
  derive_kanban_columns as unknown as DeriveKanbanColumns;

function make_task(
  id: string,
  status: Task["status"] = "todo",
  section: string | null = null,
  path = "notes/test.md",
): Task {
  return {
    id,
    path,
    text: `Task ${id}`,
    status,
    due_date: null,
    line_number: 1,
    section,
  };
}

function expect_defined<T>(value: T | undefined, label: string): T {
  expect(value, label).toBeDefined();
  return value as T;
}

function find_column(columns: KanbanColumn[], id: string): KanbanColumn {
  return expect_defined(
    columns.find((column) => column.id === id),
    `Expected column ${id}`,
  );
}

function get_columns(tasks: Task[], group_property: string): KanbanColumn[] {
  return derive_kanban_columns_typed(tasks, group_property);
}

describe("derive_kanban_columns", () => {
  it("status grouping returns three fixed columns in order", () => {
    const tasks = [
      make_task("a", "done"),
      make_task("b", "todo"),
      make_task("c", "doing"),
    ];

    const cols = get_columns(tasks, "status");

    expect(cols).toHaveLength(3);
    expect(expect_defined(cols[0], "todo column").id).toBe("todo");
    expect(expect_defined(cols[1], "doing column").id).toBe("doing");
    expect(expect_defined(cols[2], "done column").id).toBe("done");
  });

  it("status grouping assigns tasks to correct columns", () => {
    const tasks = [
      make_task("a", "todo"),
      make_task("b", "done"),
      make_task("c", "todo"),
    ];

    const cols = get_columns(tasks, "status");

    expect(find_column(cols, "todo").tasks).toHaveLength(2);
    expect(find_column(cols, "done").tasks).toHaveLength(1);
    expect(find_column(cols, "doing").tasks).toHaveLength(0);
  });

  it("section grouping creates a column per unique section", () => {
    const tasks = [
      make_task("a", "todo", "Sprint 1"),
      make_task("b", "todo", "Sprint 2"),
      make_task("c", "todo", "Sprint 1"),
      make_task("d", "todo", null),
    ];

    const cols = get_columns(tasks, "section");

    expect(cols).toHaveLength(3);
    const sprint1 = find_column(cols, "Sprint 1");
    expect(sprint1.tasks).toHaveLength(2);
    const no_section = find_column(cols, "No Section");
    expect(no_section.tasks).toHaveLength(1);
  });

  it("note grouping creates a column per unique note path with short label", () => {
    const tasks = [
      make_task("a", "todo", null, "projects/alpha.md"),
      make_task("b", "todo", null, "projects/beta.md"),
      make_task("c", "todo", null, "projects/alpha.md"),
    ];

    const cols = get_columns(tasks, "note");

    expect(cols).toHaveLength(2);
    expect(expect_defined(cols[0], "alpha column").label).toBe("alpha.md");
    expect(expect_defined(cols[1], "beta column").label).toBe("beta.md");
    expect(expect_defined(cols[0], "alpha task column").tasks).toHaveLength(2);
  });

  it("unknown groupProperty returns empty array", () => {
    const tasks = [make_task("a")];

    const cols = get_columns(tasks, "unsupported");

    expect(cols).toEqual([]);
  });

  it("empty task list returns empty columns for status grouping", () => {
    const cols = get_columns([], "status");
    expect(expect_defined(cols[0], "todo empty column").tasks).toHaveLength(0);
    expect(expect_defined(cols[1], "doing empty column").tasks).toHaveLength(0);
    expect(expect_defined(cols[2], "done empty column").tasks).toHaveLength(0);
  });
});
