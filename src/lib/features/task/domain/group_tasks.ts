import type { Task, TaskGrouping } from "../types";

export type TaskGroup = {
  key: string;
  label: string;
  tasks: Task[];
};

const STATUS_ORDER = ["todo", "doing", "done"] as const;

function file_name_from_path(path: string): string {
  return path.split("/").pop() ?? path;
}

export function group_tasks(
  tasks: Task[],
  grouping: TaskGrouping,
): TaskGroup[] {
  if (grouping === "none") {
    return [{ key: "", label: "", tasks }];
  }

  if (grouping === "status") {
    return STATUS_ORDER.map((status) => ({
      key: status,
      label: status.charAt(0).toUpperCase() + status.slice(1),
      tasks: tasks.filter((t) => t.status === status),
    })).filter((g) => g.tasks.length > 0);
  }

  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    let key: string;
    switch (grouping) {
      case "note":
        key = task.path;
        break;
      case "section":
        key = task.section ?? "(no section)";
        break;
      case "due_date":
        key = task.due_date ?? "(no due date)";
        break;
      default:
        key = "";
    }
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(task);
  }

  return Array.from(groups.entries()).map(([key, g]) => ({
    key,
    label: grouping === "note" ? file_name_from_path(key) : key,
    tasks: g,
  }));
}
