import { describe, it, expect } from "vitest";
import { derive_kanban_columns } from "$lib/features/task/ui/kanban_view.svelte";
import type { Task } from "$lib/features/task/types";

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

describe("derive_kanban_columns", () => {
  it("status grouping returns three fixed columns in order", () => {
    const tasks = [
      make_task("a", "done"),
      make_task("b", "todo"),
      make_task("c", "doing"),
    ];

    const cols = derive_kanban_columns(tasks, "status");

    expect(cols).toHaveLength(3);
    expect(cols[0]!.id).toBe("todo");
    expect(cols[1]!.id).toBe("doing");
    expect(cols[2]!.id).toBe("done");
  });

  it("status grouping assigns tasks to correct columns", () => {
    const tasks = [
      make_task("a", "todo"),
      make_task("b", "done"),
      make_task("c", "todo"),
    ];

    const cols = derive_kanban_columns(tasks, "status");

    expect(cols.find((c) => c.id === "todo")!.tasks).toHaveLength(2);
    expect(cols.find((c) => c.id === "done")!.tasks).toHaveLength(1);
    expect(cols.find((c) => c.id === "doing")!.tasks).toHaveLength(0);
  });

  it("section grouping creates a column per unique section", () => {
    const tasks = [
      make_task("a", "todo", "Sprint 1"),
      make_task("b", "todo", "Sprint 2"),
      make_task("c", "todo", "Sprint 1"),
      make_task("d", "todo", null),
    ];

    const cols = derive_kanban_columns(tasks, "section");

    expect(cols).toHaveLength(3);
    const sprint1 = cols.find((c) => c.id === "Sprint 1")!;
    expect(sprint1.tasks).toHaveLength(2);
    const no_section = cols.find((c) => c.id === "No Section")!;
    expect(no_section.tasks).toHaveLength(1);
  });

  it("note grouping creates a column per unique note path with short label", () => {
    const tasks = [
      make_task("a", "todo", null, "projects/alpha.md"),
      make_task("b", "todo", null, "projects/beta.md"),
      make_task("c", "todo", null, "projects/alpha.md"),
    ];

    const cols = derive_kanban_columns(tasks, "note");

    expect(cols).toHaveLength(2);
    expect(cols[0]!.label).toBe("alpha.md");
    expect(cols[1]!.label).toBe("beta.md");
    expect(cols[0]!.tasks).toHaveLength(2);
  });

  it("unknown groupProperty returns empty array", () => {
    const tasks = [make_task("a")];

    const cols = derive_kanban_columns(tasks, "unsupported");

    expect(cols).toEqual([]);
  });

  it("empty task list returns empty columns for status grouping", () => {
    const cols = derive_kanban_columns([], "status");
    expect(cols[0]!.tasks).toHaveLength(0);
    expect(cols[1]!.tasks).toHaveLength(0);
    expect(cols[2]!.tasks).toHaveLength(0);
  });
});
