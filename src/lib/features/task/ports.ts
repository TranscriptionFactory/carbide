import type { Task, TaskDueDateUpdate, TaskQuery, TaskUpdate } from "./types";

export interface TaskPort {
  queryTasks(vaultId: string, query: TaskQuery): Promise<Task[]>;
  getTasksForNote(vaultId: string, path: string): Promise<Task[]>;
  updateTaskState(vaultId: string, update: TaskUpdate): Promise<void>;
  updateTaskDueDate(vaultId: string, update: TaskDueDateUpdate): Promise<void>;
  createTask(vaultId: string, path: string, text: string): Promise<void>;
}
