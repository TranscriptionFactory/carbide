import {
  parse_task_query,
  group_tasks,
  leaf_of_section,
  full_section_path,
} from "$lib/features/task";
import type { Task, TaskQuery, TaskStatus } from "$lib/features/task";
import { create_logger } from "$lib/shared/utils/logger";
import { create_reactive_block } from "../reactive_block";
import type {
  SmartBlockHandler,
  SmartBlockInstance,
  SmartBlockSpec,
  SmartBlockContext,
} from "../../ports";

const log = create_logger("tasks_smart_block");

export type TaskQueryCallbacks = {
  query_tasks: (query: TaskQuery) => Promise<Task[]>;
  toggle_task: (task: Task) => Promise<void>;
  open_note?: (path: string) => void;
};

function next_task_status(status: TaskStatus): TaskStatus {
  const cycle: Record<TaskStatus, TaskStatus> = {
    todo: "doing",
    doing: "done",
    done: "todo",
  };
  return cycle[status];
}

function file_name_from_path(path: string): string {
  const parts = path.split("/");
  const name = parts[parts.length - 1] ?? path;
  return name.replace(/\.md$/, "");
}

function render_state(
  container: HTMLElement,
  class_name: string,
  lines: string[],
): void {
  const wrapper = document.createElement("div");
  wrapper.className = class_name;
  for (const line of lines) {
    const row = document.createElement("div");
    row.textContent = line;
    wrapper.appendChild(row);
  }
  container.replaceChildren(wrapper);
}

function render_tasks(
  container: HTMLElement,
  tasks: Task[],
  grouping: ReturnType<typeof parse_task_query>["grouping"],
  callbacks: TaskQueryCallbacks,
): void {
  const groups = group_tasks(tasks, grouping);
  const group_els = groups.map((group) => {
    const group_el = document.createElement("div");
    group_el.className = "task-query-group";

    if (group.label) {
      const header = document.createElement("div");
      header.className = "task-query-group-header";
      header.textContent = group.label;
      group_el.appendChild(header);
    }

    for (const task of group.tasks) {
      const item = document.createElement("div");
      item.className = "task-query-item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = task.status === "done";
      checkbox.indeterminate = task.status === "doing";
      checkbox.addEventListener("change", (e) => {
        e.preventDefault();
        const new_status = next_task_status(task.status);
        task.status = new_status;
        checkbox.checked = new_status === "done";
        checkbox.indeterminate = new_status === "doing";
        text_el.classList.toggle("task-query-done", new_status === "done");
        text_el.classList.toggle("task-query-doing", new_status === "doing");
        void callbacks.toggle_task({ ...task, status: new_status });
      });

      const text_el = document.createElement("span");
      text_el.className = "task-query-text";
      if (task.status === "done") text_el.classList.add("task-query-done");
      if (task.status === "doing") text_el.classList.add("task-query-doing");
      text_el.textContent = task.text;

      const meta_el = document.createElement("span");
      meta_el.className = "task-query-meta";

      const file_el = document.createElement("span");
      file_el.textContent = file_name_from_path(task.path);
      const on_open = callbacks.open_note;
      if (on_open) {
        file_el.className = "task-query-file-link";
        file_el.addEventListener("click", (e) => {
          e.stopPropagation();
          on_open(task.path);
        });
      }
      meta_el.appendChild(file_el);

      if (task.section) {
        meta_el.appendChild(document.createTextNode(" · "));
        const section_el = document.createElement("span");
        section_el.className = "task-query-section";
        section_el.textContent = leaf_of_section(task.section);
        section_el.title = full_section_path(task.section);
        meta_el.appendChild(section_el);
      }

      if (task.due_date) {
        meta_el.appendChild(document.createTextNode(" · "));
        const date_el = document.createElement("span");
        date_el.textContent = task.due_date;
        meta_el.appendChild(date_el);
      }

      item.appendChild(checkbox);
      item.appendChild(text_el);
      item.appendChild(meta_el);
      group_el.appendChild(item);
    }

    return group_el;
  });
  container.replaceChildren(...group_els);
}

export function create_tasks_smart_block_handler(
  callbacks: TaskQueryCallbacks,
): SmartBlockHandler {
  return {
    type: "tasks",
    create(spec: SmartBlockSpec, ctx: SmartBlockContext): SmartBlockInstance {
      const dom = document.createElement("div");
      dom.className = "task-query-results";

      let current_body = spec.body;

      const block = create_reactive_block(ctx, async (is_current) => {
        const code = current_body;
        if (!code.trim()) {
          render_state(dom, "task-query-empty", ["Empty query"]);
          return;
        }

        const parsed = parse_task_query(code);
        if (parsed.errors.length > 0) {
          render_state(dom, "task-query-error", parsed.errors);
          return;
        }

        try {
          const tasks = await callbacks.query_tasks(parsed.query);
          if (!is_current()) return;
          if (tasks.length === 0) {
            render_state(dom, "task-query-empty", ["No matching tasks"]);
            return;
          }
          render_tasks(dom, tasks, parsed.grouping, callbacks);
        } catch (error: unknown) {
          if (!is_current()) return;
          log.error("Task query failed", { error });
          render_state(dom, "task-query-error", ["Query failed"]);
        }
      });

      return {
        dom,
        update(next_spec: SmartBlockSpec) {
          current_body = next_spec.body;
          block.schedule();
        },
        destroy() {
          block.destroy();
          dom.remove();
        },
      };
    },
  };
}
