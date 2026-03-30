import type { Task, TaskFilter, TaskGrouping, TaskSort } from "../types";
import { SvelteMap } from "svelte/reactivity";

export class TaskStore {
  tasks = $state<Task[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  filter = $state<TaskFilter[]>([]);
  sort = $state<TaskSort[]>([]);
  grouping = $state<TaskGrouping>("none");
  viewMode = $state<"list" | "kanban" | "schedule">("list");
  kanbanOrientation = $state<"horizontal" | "vertical">("horizontal");
  kanbanGroupProperty = $state<string>("status");
  showQuickCapture = $state(false);

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

  setFilter(filter: TaskFilter[]) {
    this.filter = filter;
  }

  setSort(sort: TaskSort[]) {
    this.sort = sort;
  }

  setGrouping(grouping: TaskGrouping) {
    this.grouping = grouping;
  }

  setViewMode(mode: "list" | "kanban" | "schedule") {
    this.viewMode = mode;
  }

  setKanbanOrientation(orientation: "horizontal" | "vertical") {
    this.kanbanOrientation = orientation;
  }

  setKanbanGroupProperty(property: string) {
    this.kanbanGroupProperty = property;
  }

  setNoteTasks(path: string, tasks: Task[]) {
    this.noteTasks.set(path, tasks);
  }
}
