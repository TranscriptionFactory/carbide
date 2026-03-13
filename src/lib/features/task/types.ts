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

export type TaskFilter = {
  status?: TaskStatus;
};

export type TaskGrouping = "none" | "note" | "section" | "due_date" | "status";
