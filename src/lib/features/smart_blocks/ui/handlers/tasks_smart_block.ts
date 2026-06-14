import {
  parse_task_query,
  group_tasks,
  leaf_of_section,
  full_section_path,
} from "$lib/features/task";
import type { Task, TaskQuery, TaskStatus } from "$lib/features/task";
import { create_logger } from "$lib/shared/utils/logger";
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

async function render_task_query_results(
  code: string,
  container: HTMLElement,
  callbacks: TaskQueryCallbacks,
): Promise<void> {
  if (!code.trim()) {
    container.innerHTML = '<div class="task-query-empty">Empty query</div>';
    return;
  }

  const parsed = parse_task_query(code);

  if (parsed.errors.length > 0) {
    container.innerHTML = `<div class="task-query-error">${parsed.errors.map((e) => `<div>${e}</div>`).join("")}</div>`;
    return;
  }

  try {
    const tasks = await callbacks.query_tasks(parsed.query);

    if (tasks.length === 0) {
      container.innerHTML =
        '<div class="task-query-empty">No matching tasks</div>';
      return;
    }

    container.innerHTML = "";

    const grouped = group_tasks(tasks, parsed.grouping);

    for (const group of grouped) {
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
          const sep = document.createTextNode(" · ");
          meta_el.appendChild(sep);
          const date_el = document.createElement("span");
          date_el.textContent = task.due_date;
          meta_el.appendChild(date_el);
        }

        item.appendChild(checkbox);
        item.appendChild(text_el);
        item.appendChild(meta_el);
        group_el.appendChild(item);
      }

      container.appendChild(group_el);
    }
  } catch (error: unknown) {
    log.error("Task query failed", { error });
    container.innerHTML = '<div class="task-query-error">Query failed</div>';
  }
}

export function create_tasks_smart_block_handler(
  callbacks: TaskQueryCallbacks,
): SmartBlockHandler {
  return {
    type: "tasks",
    create(spec: SmartBlockSpec, _ctx: SmartBlockContext): SmartBlockInstance {
      const dom = document.createElement("div");
      dom.className = "task-query-results";

      let render_timer: ReturnType<typeof setTimeout> | undefined;
      let current_body = spec.body;

      function schedule_render() {
        clearTimeout(render_timer);
        render_timer = setTimeout(() => {
          void render_task_query_results(current_body, dom, callbacks);
        }, 150);
      }

      schedule_render();

      return {
        dom,
        update(next_spec: SmartBlockSpec) {
          current_body = next_spec.body;
          schedule_render();
        },
        destroy() {
          clearTimeout(render_timer);
          dom.remove();
        },
      };
    },
  };
}
