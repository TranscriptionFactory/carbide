import { invoke } from "@tauri-apps/api/core";
import type { TaskPort } from "../ports";
import type { Task, TaskDueDateUpdate, TaskQuery, TaskUpdate } from "../types";

export class TaskTauriAdapter implements TaskPort {
  async queryTasks(vaultId: string, query: TaskQuery): Promise<Task[]> {
    return invoke<Task[]>("tasks_query", { vaultId, query });
  }

  async getTasksForNote(vaultId: string, path: string): Promise<Task[]> {
    return invoke<Task[]>("tasks_get_for_note", { vaultId, path });
  }

  async updateTaskState(vaultId: string, update: TaskUpdate): Promise<void> {
    return invoke<void>("tasks_update_state", { vaultId, update });
  }

  async updateTaskDueDate(
    vaultId: string,
    update: TaskDueDateUpdate,
  ): Promise<void> {
    return invoke<void>("tasks_update_due_date", { vaultId, update });
  }

  async createTask(vaultId: string, path: string, text: string): Promise<void> {
    return invoke<void>("tasks_create", { vaultId, path, text });
  }
}
