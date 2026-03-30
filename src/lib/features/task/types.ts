export type TaskStatus = "todo" | "doing" | "done";

export interface Task {
  id: string;
  path: string;
  text: string;
  status: TaskStatus;
  due_date: string | null;
  line_number: number;
  section: string | null;
}

export interface TaskUpdate {
  path: string;
  line_number: number;
  status: TaskStatus;
}

export interface TaskFilter {
  property: string;
  operator: "eq" | "neq" | "contains" | "gt" | "lt" | "gte" | "lte";
  value: string;
}

export interface TaskSort {
  property: string;
  descending: boolean;
}

export interface TaskQuery {
  filters: TaskFilter[];
  sort: TaskSort[];
  limit: number;
  offset: number;
}

export interface TaskDueDateUpdate {
  path: string;
  line_number: number;
  new_due_date: string | null;
}

export type TaskGrouping = "none" | "note" | "section" | "due_date" | "status";
