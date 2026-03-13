import type { Task, TaskFilter, TaskUpdate } from './types';

export interface TaskPort {
  queryTasks(vaultId: string, filter?: TaskFilter): Promise<Task[]>;
  getTasksForNote(vaultId: string, path: string): Promise<Task[]>;
  updateTaskState(vaultId: string, update: TaskUpdate): Promise<void>;
  createTask(vaultId: string, path: string, text: string): Promise<void>;
}
