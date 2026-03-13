import type { Task, TaskFilter, TaskGrouping } from '../types';
import { SvelteMap } from 'svelte/reactivity';

export class TaskStore {
  tasks = $state<Task[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  filter = $state<TaskFilter>({});
  grouping = $state<TaskGrouping>('none');
  viewMode = $state<'list' | 'kanban' | 'schedule'>('list');
  
  // Cache for tasks by note path
  noteTasks = new SvelteMap<string, Task[]>();

  setTasks(tasks: Task[]) {
    this.tasks = tasks;
  }

  setLoading(loading: boolean) {
    this.loading = loading;
  }

  setError(error: string | null) {
    this.error = error;
  }

  setFilter(filter: TaskFilter) {
    this.filter = filter;
  }

  setGrouping(grouping: TaskGrouping) {
    this.grouping = grouping;
  }

  setViewMode(mode: 'list' | 'kanban' | 'schedule') {
    this.viewMode = mode;
  }

  setNoteTasks(path: string, tasks: Task[]) {
    this.noteTasks.set(path, tasks);
  }
}

export const taskStore = new TaskStore();
