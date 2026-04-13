import { describe, expect, it } from "vitest";
import { TaskListStore } from "$lib/features/task_list/state/task_list_store.svelte";

describe("TaskListStore", () => {
  it("initializes with empty state", () => {
    const store = new TaskListStore();
    expect(store.available).toEqual([]);
    expect(store.lists.size).toBe(0);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("can set and get lists", () => {
    const store = new TaskListStore();
    const list = {
      name: "Sprint 1",
      items: [
        { id: "a", text: "Task A", status: "todo" as const, due_date: null },
      ],
      created_at: "2026-04-12T00:00:00Z",
      updated_at: "2026-04-12T00:00:00Z",
    };
    store.lists.set("Sprint 1", list);
    expect(store.lists.get("Sprint 1")).toEqual(list);
    expect(store.lists.size).toBe(1);
  });

  it("can delete lists", () => {
    const store = new TaskListStore();
    store.lists.set("test", {
      name: "test",
      items: [],
      created_at: "",
      updated_at: "",
    });
    expect(store.lists.has("test")).toBe(true);
    store.lists.delete("test");
    expect(store.lists.has("test")).toBe(false);
  });
});
