import { describe, it, expect } from "vitest";
import { TaskStore } from "$lib/features/task/state/task_store.svelte";
import type { Task } from "$lib/features/task/types";

function make_task(id: string, status: Task["status"] = "todo"): Task {
  return {
    id,
    path: "notes/test.md",
    text: `Task ${id}`,
    status,
    due_date: null,
    line_number: 1,
    section: null,
  };
}

describe("TaskStore", () => {
  it("has correct initial state", () => {
    const store = new TaskStore();

    expect(store.tasks).toEqual([]);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
    expect(store.filter).toEqual([]);
    expect(store.grouping).toBe("none");
    expect(store.viewMode).toBe("list");
    expect(store.kanbanOrientation).toBe("horizontal");
  });

  it("setTasks replaces task list", () => {
    const store = new TaskStore();
    const tasks = [make_task("a"), make_task("b")];

    store.setTasks(tasks);

    expect(store.tasks).toEqual(tasks);
  });

  it("setLoading updates loading flag", () => {
    const store = new TaskStore();

    store.setLoading(true);
    expect(store.loading).toBe(true);

    store.setLoading(false);
    expect(store.loading).toBe(false);
  });

  it("setError updates error message", () => {
    const store = new TaskStore();

    store.setError("network failure");
    expect(store.error).toBe("network failure");

    store.setError(null);
    expect(store.error).toBeNull();
  });

  it("setFilter replaces filter", () => {
    const store = new TaskStore();

    store.setFilter([{ property: "status", operator: "eq", value: "todo" }]);
    expect(store.filter).toEqual([
      { property: "status", operator: "eq", value: "todo" },
    ]);
  });

  it("setGrouping changes grouping", () => {
    const store = new TaskStore();

    store.setGrouping("status");
    expect(store.grouping).toBe("status");
  });

  it("setViewMode switches view", () => {
    const store = new TaskStore();

    store.setViewMode("kanban");
    expect(store.viewMode).toBe("kanban");

    store.setViewMode("schedule");
    expect(store.viewMode).toBe("schedule");
  });

  it("setNoteTasks caches tasks by path", () => {
    const store = new TaskStore();
    const tasks = [make_task("a"), make_task("b")];

    store.setNoteTasks("notes/test.md", tasks);
    expect(store.noteTasks.get("notes/test.md")).toEqual(tasks);
  });

  it("setNoteTasks for different paths are independent", () => {
    const store = new TaskStore();
    const tasks_a = [make_task("a")];
    const tasks_b = [make_task("b")];

    store.setNoteTasks("a.md", tasks_a);
    store.setNoteTasks("b.md", tasks_b);

    expect(store.noteTasks.get("a.md")).toEqual(tasks_a);
    expect(store.noteTasks.get("b.md")).toEqual(tasks_b);
  });
});
