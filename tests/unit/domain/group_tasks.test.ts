import { describe, it, expect } from "vitest";
import {
  group_tasks,
  type TaskGroup,
} from "$lib/features/task/domain/group_tasks";
import type { Task, TaskGrouping } from "$lib/features/task/types";

function make_task(
  id: string,
  overrides: Partial<Task> = {},
): Task {
  return {
    id,
    path: "notes/test.md",
    text: `Task ${id}`,
    status: "todo",
    due_date: null,
    line_number: 1,
    section: null,
    ...overrides,
  };
}

describe("group_tasks", () => {
  describe("none grouping", () => {
    it("returns single group with all tasks", () => {
      const tasks = [make_task("a"), make_task("b")];
      const result = group_tasks(tasks, "none");
      expect(result).toHaveLength(1);
      expect(result[0]!.label).toBe("");
      expect(result[0]!.tasks).toHaveLength(2);
    });
  });

  describe("status grouping", () => {
    it("groups by status and preserves order", () => {
      const tasks = [
        make_task("a", { status: "done" }),
        make_task("b", { status: "todo" }),
        make_task("c", { status: "doing" }),
      ];
      const result = group_tasks(tasks, "status");
      expect(result.map((g) => g.key)).toEqual(["todo", "doing", "done"]);
    });

    it("omits empty status groups", () => {
      const tasks = [make_task("a", { status: "todo" })];
      const result = group_tasks(tasks, "status");
      expect(result).toHaveLength(1);
      expect(result[0]!.key).toBe("todo");
    });

    it("returns empty array for no tasks", () => {
      expect(group_tasks([], "status")).toHaveLength(0);
    });
  });

  describe("note grouping", () => {
    it("groups by path with short label", () => {
      const tasks = [
        make_task("a", { path: "projects/alpha.md" }),
        make_task("b", { path: "projects/beta.md" }),
        make_task("c", { path: "projects/alpha.md" }),
      ];
      const result = group_tasks(tasks, "note");
      expect(result).toHaveLength(2);
      const alpha = result.find((g) => g.key === "projects/alpha.md");
      expect(alpha).toBeDefined();
      expect(alpha!.label).toBe("alpha.md");
      expect(alpha!.tasks).toHaveLength(2);
    });
  });

  describe("section grouping", () => {
    it("groups by section with fallback label", () => {
      const tasks = [
        make_task("a", { section: "Sprint 1" }),
        make_task("b", { section: null }),
      ];
      const result = group_tasks(tasks, "section");
      expect(result).toHaveLength(2);
      expect(result.find((g) => g.key === "(no section)")).toBeDefined();
    });
  });

  describe("due_date grouping", () => {
    it("groups by due date with fallback label", () => {
      const tasks = [
        make_task("a", { due_date: "2026-01-01" }),
        make_task("b", { due_date: null }),
        make_task("c", { due_date: "2026-01-01" }),
      ];
      const result = group_tasks(tasks, "due_date");
      expect(result).toHaveLength(2);
      const dated = result.find((g) => g.key === "2026-01-01");
      expect(dated!.tasks).toHaveLength(2);
      expect(result.find((g) => g.key === "(no due date)")).toBeDefined();
    });
  });
});
