import type { TaskPort } from "../ports";
import type { TaskStore } from "../state/task_store.svelte";
import type { VaultStore } from "$lib/features/vault";
import type { EditorStore } from "$lib/features/editor";
import type { TaskDueDateUpdate, TaskQuery, TaskStatus } from "../types";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("task_service");

export class TaskService {
  constructor(
    private readonly port: TaskPort,
    private readonly store: TaskStore,
    private readonly vaultStore: VaultStore,
    private readonly editorStore?: EditorStore,
    private readonly update_task_in_editor?: (
      line_number: number,
      status: TaskStatus,
    ) => boolean,
  ) {}

  private build_query(overrides: Partial<TaskQuery> = {}): TaskQuery {
    return {
      filters: this.store.filter,
      sort: this.store.sort,
      limit: 0,
      offset: 0,
      ...overrides,
    };
  }

  async queryTasks(overrides: Partial<TaskQuery> = {}) {
    const vault = this.vaultStore.vault;
    if (!vault) return;

    this.store.setLoading(true);
    this.store.setError(null);
    try {
      const tasks = await this.port.queryTasks(
        vault.id,
        this.build_query(overrides),
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
      log.error(`Failed to get tasks for note ${path}:`, { error: e });
      return [];
    }
  }

  async updateTaskStatus(path: string, lineNumber: number, status: TaskStatus) {
    const vault = this.vaultStore.vault;
    if (!vault) return;

    if (
      this.editorStore?.open_note?.meta.path === path &&
      this.update_task_in_editor
    ) {
      try {
        if (this.update_task_in_editor(lineNumber, status)) {
          return;
        }
      } catch (e) {
        log.warn(
          "Editor-first task update failed, falling back to Rust write:",
          { error: e },
        );
      }
    }

    try {
      await this.port.updateTaskState(vault.id, {
        path,
        line_number: lineNumber,
        status,
      });
      await this.queryTasks();
    } catch (e) {
      log.error("Failed to update task status:", { error: e });
      this.store.setError(e instanceof Error ? e.message : String(e));
    }
  }

  async updateTaskDueDate(
    path: string,
    lineNumber: number,
    newDueDate: string | null,
  ) {
    const vault = this.vaultStore.vault;
    if (!vault) return;

    const update: TaskDueDateUpdate = {
      path,
      line_number: lineNumber,
      new_due_date: newDueDate,
    };
    try {
      await this.port.updateTaskDueDate(vault.id, update);
      await this.queryTasks();
    } catch (e) {
      log.error("Failed to update task due date:", { error: e });
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
      log.error("Failed to create task:", { error: e });
      this.store.setError(e instanceof Error ? e.message : String(e));
    }
  }
}
