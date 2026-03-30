import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

export const task_decoration_plugin_key = new PluginKey("task-decoration");

const DUE_DATE_PATTERNS = [
  /\u{1F4C5}\s*(\d{4}-\d{2}-\d{2})/u,
  /due:\s*(\d{4}-\d{2}-\d{2})/,
  /@(\d{4}-\d{2}-\d{2})/,
];

export type ParsedDueDate = {
  date: string;
  format: "\u{1F4C5}" | "due:" | "@";
  overdue: boolean;
  today: boolean;
};

export function parse_task_due_date(text: string): ParsedDueDate | null {
  for (const pattern of DUE_DATE_PATTERNS) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      const date = match[1];
      const today = new Date().toISOString().split("T")[0]!;
      const format = pattern.source.startsWith("\\u")
        ? ("\u{1F4C5}" as "\u{1F4C5}")
        : pattern.source.startsWith("due")
          ? "due:"
          : "@";
      return {
        date,
        format,
        overdue: date < today,
        today: date === today,
      };
    }
  }
  return null;
}

function build_decorations(
  doc: import("prosemirror-model").Node,
): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "list_item") return true;
    if (node.attrs["checked"] === null && node.attrs["task_status"] === null)
      return true;

    const task_status: string =
      node.attrs["task_status"] ?? (node.attrs["checked"] ? "done" : "todo");
    const status_classes: Record<string, string> = {
      todo: "task-status-todo",
      doing: "task-status-doing",
      done: "task-status-done",
    };
    const cls = status_classes[task_status];
    if (cls) {
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, { class: cls }),
      );
    }

    const text = node.textContent;
    const due = parse_task_due_date(text);
    if (due) {
      const due_class = due.overdue
        ? "task-due-overdue"
        : due.today
          ? "task-due-today"
          : "task-due-future";
      const match_offset = text.search(/\u{1F4C5}|due:|@\d{4}/u);
      if (match_offset >= 0) {
        const text_start = pos + 1;
        const date_from = text_start + match_offset;
        const date_to =
          date_from +
          (due.date.length + (due.format === "@" ? 1 : due.format.length + 1));
        decorations.push(
          Decoration.inline(date_from, date_to, { class: due_class }),
        );
      }
    }

    return true;
  });

  return DecorationSet.create(doc, decorations);
}

export function create_task_decoration_plugin(): Plugin {
  return new Plugin({
    key: task_decoration_plugin_key,
    state: {
      init(_, { doc }) {
        return build_decorations(doc);
      },
      apply(tr, old_deco) {
        if (!tr.docChanged) return old_deco;
        return build_decorations(tr.doc);
      },
    },
    props: {
      decorations(state) {
        return (
          task_decoration_plugin_key.getState(state) ?? DecorationSet.empty
        );
      },
    },
  });
}
