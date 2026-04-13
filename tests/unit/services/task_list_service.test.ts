import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskListService } from "$lib/features/task_list/application/task_list_service";
import { TaskListStore } from "$lib/features/task_list/state/task_list_store.svelte";
import type { TaskListPort } from "$lib/features/task_list/ports";
import type { VaultId } from "$lib/shared/types/ids";

function make_mock_port(): TaskListPort {
  return {
    list_task_lists: vi.fn().mockResolvedValue(["Sprint 1", "Backlog"]),
    read_task_list: vi.fn().mockResolvedValue({
      name: "Sprint 1",
      items: [{ id: "a1", text: "Task A", status: "todo", due_date: null }],
      created_at: "2026-04-12T00:00:00Z",
      updated_at: "2026-04-12T00:00:00Z",
    }),
    write_task_list: vi.fn().mockResolvedValue(undefined),
    delete_task_list: vi.fn().mockResolvedValue(undefined),
  };
}

const VAULT_ID = "vault-1" as VaultId;

describe("TaskListService", () => {
  let port: TaskListPort;
  let store: TaskListStore;
  let service: TaskListService;

  beforeEach(() => {
    port = make_mock_port();
    store = new TaskListStore();
    service = new TaskListService(port, store);
  });

  it("load_available populates store.available", async () => {
    await service.load_available(VAULT_ID);
    expect(store.available).toEqual(["Sprint 1", "Backlog"]);
    expect(store.loading).toBe(false);
  });

  it("load_list reads and caches", async () => {
    await service.load_list(VAULT_ID, "Sprint 1");
    expect(store.lists.has("Sprint 1")).toBe(true);
    expect(store.lists.get("Sprint 1")!.items).toHaveLength(1);
  });

  it("load_list skips if already cached", async () => {
    store.lists.set("Sprint 1", {
      name: "Sprint 1",
      items: [],
      created_at: "",
      updated_at: "",
    });
    await service.load_list(VAULT_ID, "Sprint 1");
    expect(port.read_task_list).not.toHaveBeenCalled();
  });

  it("create_list writes and updates store", async () => {
    await service.create_list(VAULT_ID, "New List");
    expect(port.write_task_list).toHaveBeenCalled();
    expect(store.lists.has("New List")).toBe(true);
    expect(store.available).toContain("New List");
  });

  it("add_item adds to list and writes", async () => {
    await service.load_list(VAULT_ID, "Sprint 1");
    await service.add_item(VAULT_ID, "Sprint 1", "New task");
    const list = store.lists.get("Sprint 1")!;
    expect(list.items).toHaveLength(2);
    expect(list.items[1]!.text).toBe("New task");
    expect(list.items[1]!.status).toBe("todo");
    expect(port.write_task_list).toHaveBeenCalled();
  });

  it("toggle_item flips todo to done", async () => {
    await service.load_list(VAULT_ID, "Sprint 1");
    await service.toggle_item(VAULT_ID, "Sprint 1", "a1");
    const list = store.lists.get("Sprint 1")!;
    expect(list.items[0]!.status).toBe("done");
  });

  it("toggle_item flips done to todo", async () => {
    await service.load_list(VAULT_ID, "Sprint 1");
    await service.update_item(VAULT_ID, "Sprint 1", "a1", { status: "done" });
    await service.toggle_item(VAULT_ID, "Sprint 1", "a1");
    const list = store.lists.get("Sprint 1")!;
    expect(list.items[0]!.status).toBe("todo");
  });

  it("remove_item removes from list", async () => {
    await service.load_list(VAULT_ID, "Sprint 1");
    await service.remove_item(VAULT_ID, "Sprint 1", "a1");
    const list = store.lists.get("Sprint 1")!;
    expect(list.items).toHaveLength(0);
  });

  it("delete_list removes from store and calls port", async () => {
    store.available = ["Sprint 1"];
    store.lists.set("Sprint 1", {
      name: "Sprint 1",
      items: [],
      created_at: "",
      updated_at: "",
    });
    await service.delete_list(VAULT_ID, "Sprint 1");
    expect(store.lists.has("Sprint 1")).toBe(false);
    expect(store.available).not.toContain("Sprint 1");
    expect(port.delete_task_list).toHaveBeenCalledWith(VAULT_ID, "Sprint 1");
  });

  it("handles port errors gracefully", async () => {
    (port.list_task_lists as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("network error"),
    );
    await service.load_available(VAULT_ID);
    expect(store.error).toBe("Error: network error");
    expect(store.loading).toBe(false);
  });

  it("add_item rolls back on write failure", async () => {
    await service.load_list(VAULT_ID, "Sprint 1");
    (port.write_task_list as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("write failed"),
    );
    await service.add_item(VAULT_ID, "Sprint 1", "Fail task");
    const list = store.lists.get("Sprint 1")!;
    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.text).toBe("Task A");
  });
});
