import { invoke } from "@tauri-apps/api/core";
import type { TaskPort } from "../ports";
import type { Task, TaskFilter, TaskUpdate } from "../types";

export class TaskTauriAdapter implements TaskPort {
  async queryTasks(vaultId: string, filter?: TaskFilter): Promise<Task[]> {
    return invoke<Task[]>("tasks_query", {
      vaultId,
      status: filter?.status,
    });
  }

  async getTasksForNote(vaultId: string, path: string): Promise<Task[]> {
    return invoke<Task[]>("tasks_get_for_note", { vaultId, path });
  }

  async updateTaskState(vaultId: string, update: TaskUpdate): Promise<void> {
    return invoke<void>("tasks_update_state", { vaultId, update });
  }

  async createTask(vaultId: string, path: string, text: string): Promise<void> {
    return invoke<void>("tasks_create", { vaultId, path, text });
  }
}
