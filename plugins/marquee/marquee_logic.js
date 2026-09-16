export const POOL_LIMIT = 200;
export const BASE_ROW_LIMIT = 500;

const SETTING_DEFAULTS = {
  status: "open",
  text: "",
  due: "any",
  tags: "",
  base_property: "",
  base_operator: "eq",
  base_value: "",
  show_note_name: true,
  max_items: 40,
  scroll_seconds: 45,
  poll_seconds: 20,
  theme: "auto",
};

const SETTING_KEYS = {
  status: "task_status",
  text: "task_text",
  due: "task_due",
  tags: "tags",
  base_property: "base_property",
  base_operator: "base_operator",
  base_value: "base_value",
  show_note_name: "show_note_name",
  max_items: "max_items",
  scroll_seconds: "scroll_seconds",
  poll_seconds: "poll_seconds",
  theme: "theme",
};

const SETTING_ENUMS = {
  status: ["all", "open", "todo", "doing", "done"],
  due: ["any", "overdue", "today", "next_7_days"],
  base_operator: [
    "eq",
    "neq",
    "contains",
    "not_contains",
    "gt",
    "lt",
    "gte",
    "lte",
  ],
  theme: ["auto", "light", "dark"],
};

const SETTING_RANGES = {
  max_items: [1, 200],
  scroll_seconds: [10, 600],
  poll_seconds: [15, 600],
};

const STATUS_ATOMS = {
  open: { operator: "neq", value: "done" },
  todo: { operator: "eq", value: "todo" },
  doing: { operator: "eq", value: "doing" },
  done: { operator: "eq", value: "done" },
};

const DUE_ATOMS = {
  overdue: { operator: "lt", value: "__today__" },
  today: { operator: "eq", value: "__today__" },
};

function clamp_number(value, min, max, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function read_setting(value, key) {
  const fallback = SETTING_DEFAULTS[key];
  const options = SETTING_ENUMS[key];
  if (options) return options.includes(value) ? value : fallback;
  const range = SETTING_RANGES[key];
  if (range) return clamp_number(value, range[0], range[1], fallback);
  if (typeof fallback === "boolean") {
    return typeof value === "boolean" ? value : fallback;
  }
  return typeof value === "string" ? value : fallback;
}

export function normalize_settings(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const settings = {};
  for (const key of Object.keys(SETTING_DEFAULTS)) {
    settings[key] = read_setting(input[SETTING_KEYS[key]], key);
  }
  return settings;
}

export function parse_tag_list(raw) {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((tag) => tag.trim().replace(/^#/, "").trim())
    .filter((tag) => tag.length > 0);
}

function atom(property, operator, value) {
  return { type: "atom", filter: { property, operator, value } };
}

export function build_task_filter(settings) {
  const operands = [];

  const status = STATUS_ATOMS[settings.status];
  if (status) operands.push(atom("status", status.operator, status.value));

  if (settings.text) operands.push(atom("text", "contains", settings.text));

  const due = DUE_ATOMS[settings.due];
  if (due) {
    operands.push(atom("due_date", due.operator, due.value));
  } else if (settings.due === "next_7_days") {
    operands.push({
      type: "and",
      operands: [
        atom("due_date", "gte", "__today__"),
        atom("due_date", "lte", "__today_plus_7__"),
      ],
    });
  }

  if (operands.length === 0) return null;
  if (operands.length === 1) return operands[0];
  return { type: "and", operands };
}

export function merge_note_sets(sets) {
  const present = sets.filter((set) => Array.isArray(set));
  if (present.length === 0) return null;

  const merged = new Set(present[0]);
  for (const set of present.slice(1)) {
    for (const path of [...merged]) {
      if (!set.includes(path)) merged.delete(path);
    }
  }
  return merged;
}

export function restrict_to_notes(tasks, paths) {
  if (paths === null) return tasks;
  return tasks.filter((task) => paths.has(task.path));
}

function compare_tasks(a, b) {
  const a_due = typeof a.due_date === "string" ? a.due_date : null;
  const b_due = typeof b.due_date === "string" ? b.due_date : null;

  if (a_due !== b_due) {
    if (a_due === null) return 1;
    if (b_due === null) return -1;
    return a_due < b_due ? -1 : 1;
  }
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  return a.line_number - b.line_number;
}

export function sort_tasks(tasks) {
  return [...tasks].sort(compare_tasks);
}

export function select_tasks(tasks, paths, max_items) {
  return sort_tasks(restrict_to_notes(tasks, paths)).slice(0, max_items);
}
