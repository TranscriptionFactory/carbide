export type TaskListItemStatus = "todo" | "doing" | "done";

export interface TaskListItem {
  id: string;
  text: string;
  status: TaskListItemStatus;
  due_date: string | null;
}

export interface TaskList {
  name: string;
  items: TaskListItem[];
  created_at: string;
  updated_at: string;
}

export interface TaskListEmbed {
  list_name: string;
}
