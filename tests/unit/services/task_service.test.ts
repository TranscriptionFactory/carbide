import { describe, it, expect, vi } from "vitest";
import { TaskService } from "$lib/features/task/application/task_service";
import { TaskStore } from "$lib/features/task/state/task_store.svelte";
import type { TaskPort } from "$lib/features/task/ports";
import type { Task } from "$lib/features/task/types";

const VAULT_ID = "vault-1" as never;

function make_task(id: string): Task {
  return {
    id,
    path: "test.md",
    text: `Task ${id}`,
    status: "todo",
    due_date: null,
    line_number: 1,
    section: null,
  };
}

function make_port(overrides: Partial<TaskPort> = {}): TaskPort {
  return {
    queryTasks: vi.fn().mockResolvedValue([]),
    getTasksForNote: vi.fn().mockResolvedValue([]),
    updateTaskState: vi.fn().mockResolvedValue(undefined),
    updateTaskDueDate: vi.fn().mockResolvedValue(undefined),
    createTask: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function make_vault_store(vault_id = VAULT_ID) {
  return { vault: { id: vault_id } } as any;
}

function make_service(port_overrides: Partial<TaskPort> = {}) {
  const store = new TaskStore();
  const port = make_port(port_overrides);
  const vault_store = make_vault_store();
  const service = new TaskService(port, store, vault_store);
  return { service, store, port };
}

describe("TaskService", () => {
  it("queryTasks sends store filter and sort to port", async () => {
    const { service, store, port } = make_service();
    store.setFilter([{ property: "status", operator: "eq", value: "todo" }]);
    store.setSort([{ property: "due_date", descending: false }]);

    await service.queryTasks();

    expect(port.queryTasks).toHaveBeenCalledWith(VAULT_ID, {
      filters: [{ property: "status", operator: "eq", value: "todo" }],
      sort: [{ property: "due_date", descending: false }],
      limit: 0,
      offset: 0,
    });
  });

  it("queryTasks sets tasks on store from port result", async () => {
    const tasks = [make_task("a"), make_task("b")];
    const { service, store } = make_service({
      queryTasks: vi.fn().mockResolvedValue(tasks),
    });

    await service.queryTasks();

    expect(store.tasks).toEqual(tasks);
  });

  it("queryTasks sets loading true then false", async () => {
    const loading_sequence: boolean[] = [];
    const { service, store } = make_service({
      queryTasks: vi.fn().mockImplementation(async () => {
        loading_sequence.push(store.loading);
        return [];
      }),
    });

    await service.queryTasks();

    expect(loading_sequence).toContain(true);
    expect(store.loading).toBe(false);
  });

  it("queryTasks sets error on failure", async () => {
    const { service, store } = make_service({
      queryTasks: vi.fn().mockRejectedValue(new Error("db error")),
    });

    await service.queryTasks();

    expect(store.error).toContain("db error");
  });

  it("updateTaskDueDate calls port and refreshes", async () => {
    const { service, port } = make_service();

    await service.updateTaskDueDate("notes/test.md", 3, "2024-12-01");

    expect(port.updateTaskDueDate).toHaveBeenCalledWith(VAULT_ID, {
      path: "notes/test.md",
      line_number: 3,
      new_due_date: "2024-12-01",
    });
    expect(port.queryTasks).toHaveBeenCalled();
  });

  it("createTask calls port and refreshes", async () => {
    const { service, port } = make_service();

    await service.createTask("notes/test.md", "new task text");

    expect(port.createTask).toHaveBeenCalledWith(
      VAULT_ID,
      "notes/test.md",
      "new task text",
    );
    expect(port.queryTasks).toHaveBeenCalled();
  });
});
