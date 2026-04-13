import type { VaultId } from "$lib/shared/types/ids";
import type { TaskListPort } from "../ports";
import type { TaskListStore } from "../state/task_list_store.svelte";
import type { TaskList, TaskListItem, TaskListItemStatus } from "../types";

function generate_id(): string {
  return Math.random().toString(36).slice(2, 10);
}

function now_iso(): string {
  return new Date().toISOString();
}

export class TaskListService {
  constructor(
    private port: TaskListPort,
    private store: TaskListStore,
  ) {}

  async load_available(vault_id: VaultId) {
    this.store.loading = true;
    this.store.error = null;
    try {
      const names = await this.port.list_task_lists(vault_id);
      this.store.available = names;
    } catch (e) {
      this.store.error = String(e);
    } finally {
      this.store.loading = false;
    }
  }

  async load_list(vault_id: VaultId, name: string) {
    if (this.store.lists.has(name)) return;
    try {
      const list = await this.port.read_task_list(vault_id, name);
      this.store.lists.set(name, list);
    } catch (e) {
      this.store.error = String(e);
    }
  }

  async create_list(vault_id: VaultId, name: string) {
    const list: TaskList = {
      name,
      items: [],
      created_at: now_iso(),
      updated_at: now_iso(),
    };
    try {
      await this.port.write_task_list(vault_id, name, list);
      this.store.lists.set(name, list);
      if (!this.store.available.includes(name)) {
        this.store.available = [...this.store.available, name].sort();
      }
    } catch (e) {
      this.store.error = String(e);
    }
  }

  async add_item(vault_id: VaultId, list_name: string, text: string) {
    const list = this.store.lists.get(list_name);
    if (!list) return;

    const item: TaskListItem = {
      id: generate_id(),
      text,
      status: "todo",
      due_date: null,
    };

    const updated: TaskList = {
      ...list,
      items: [...list.items, item],
      updated_at: now_iso(),
    };

    this.store.lists.set(list_name, updated);
    try {
      await this.port.write_task_list(vault_id, list_name, updated);
    } catch (e) {
      this.store.lists.set(list_name, list);
      this.store.error = String(e);
    }
  }

  async update_item(
    vault_id: VaultId,
    list_name: string,
    item_id: string,
    changes: Partial<Pick<TaskListItem, "text" | "status" | "due_date">>,
  ) {
    const list = this.store.lists.get(list_name);
    if (!list) return;

    const updated: TaskList = {
      ...list,
      items: list.items.map((item) =>
        item.id === item_id ? { ...item, ...changes } : item,
      ),
      updated_at: now_iso(),
    };

    this.store.lists.set(list_name, updated);
    try {
      await this.port.write_task_list(vault_id, list_name, updated);
    } catch (e) {
      this.store.lists.set(list_name, list);
      this.store.error = String(e);
    }
  }

  async remove_item(vault_id: VaultId, list_name: string, item_id: string) {
    const list = this.store.lists.get(list_name);
    if (!list) return;

    const updated: TaskList = {
      ...list,
      items: list.items.filter((item) => item.id !== item_id),
      updated_at: now_iso(),
    };

    this.store.lists.set(list_name, updated);
    try {
      await this.port.write_task_list(vault_id, list_name, updated);
    } catch (e) {
      this.store.lists.set(list_name, list);
      this.store.error = String(e);
    }
  }

  async toggle_item(vault_id: VaultId, list_name: string, item_id: string) {
    const list = this.store.lists.get(list_name);
    if (!list) return;

    const item = list.items.find((i) => i.id === item_id);
    if (!item) return;

    const next_status: TaskListItemStatus =
      item.status === "done" ? "todo" : "done";
    await this.update_item(vault_id, list_name, item_id, {
      status: next_status,
    });
  }

  async delete_list(vault_id: VaultId, name: string) {
    try {
      await this.port.delete_task_list(vault_id, name);
      this.store.lists.delete(name);
      this.store.available = this.store.available.filter((n) => n !== name);
    } catch (e) {
      this.store.error = String(e);
    }
  }
}
