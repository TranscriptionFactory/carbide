import type { TaskPort } from "../ports";
import type { TaskStore } from "../state/task_store.svelte";
import type { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import type { TaskFilter, TaskStatus } from "../types";

export class TaskService {
  constructor(
    private readonly port: TaskPort,
    private readonly store: TaskStore,
    private readonly vaultStore: VaultStore,
  ) {}

  async queryTasks(filter?: TaskFilter) {
    const vault = this.vaultStore.vault;
    if (!vault) return;

    this.store.setLoading(true);
    this.store.setError(null);
    try {
      const tasks = await this.port.queryTasks(
        vault.id,
        filter || this.store.filter,
      );
      this.store.setTasks(tasks);
    } catch (e) {
      this.store.setError(e instanceof Error ? e.message : String(e));
    } finally {
      this.store.setLoading(false);
    }
  }

  async refreshTasks() {
    return this.queryTasks();
  }

  async getTasksForNote(path: string) {
    const vault = this.vaultStore.vault;
    if (!vault) return [];

    try {
      const tasks = await this.port.getTasksForNote(vault.id, path);
      this.store.setNoteTasks(path, tasks);
      return tasks;
    } catch (e) {
      console.error(`Failed to get tasks for note ${path}:`, e);
      return [];
    }
  }

  async updateTaskStatus(path: string, lineNumber: number, status: TaskStatus) {
    const vault = this.vaultStore.vault;
    if (!vault) return;

    try {
      await this.port.updateTaskState(vault.id, {
        path,
        line_number: lineNumber,
        status,
      });
      await this.queryTasks();
    } catch (e) {
      console.error(`Failed to update task status:`, e);
      this.store.setError(e instanceof Error ? e.message : String(e));
    }
  }

  async createTask(path: string, text: string) {
    const vault = this.vaultStore.vault;
    if (!vault) return;

    try {
      await this.port.createTask(vault.id, path, text);
      await this.queryTasks();
    } catch (e) {
      console.error(`Failed to create task:`, e);
      this.store.setError(e instanceof Error ? e.message : String(e));
    }
  }
}
