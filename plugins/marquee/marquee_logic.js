export const POOL_LIMIT = 200;
export const BASE_ROW_LIMIT = 500;
export const SECTION_POOL_LIMIT = 200;

const SETTING_DEFAULTS = {
  status: "open",
  text: "",
  due: "any",
  tags: "",
  base_property: "",
  base_operator: "eq",
  base_value: "",
  section_title: "",
  section_level: "any",
  section_under: "",
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
  section_title: "section_title",
  section_level: "section_level",
  section_under: "section_under",
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
  section_level: ["any", "1", "2", "3"],
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

// The structured `SectionFilter` the `sections.query` RPC takes. Null when no
// section setting is on, so the default panel issues no sections call at all.
export function build_section_filter(settings) {
  const title = settings.section_title;
  const level = settings.section_level;
  const under = settings.section_under;
  if (!title && level === "any" && !under) return null;

  const filter = { limit: SECTION_POOL_LIMIT };
  if (title) filter.title = title;
  if (level !== "any") {
    const level_number = Number(level);
    filter.level_min = level_number;
    filter.level_max = level_number;
  }
  if (under) filter.heading_path_under = under;
  return filter;
}

// One row shape for both pools; `kind` is the only structural difference, so
// the restrict step and the comparator stay single.
export function build_rows(tasks, sections) {
  const rows = tasks.map((task) => ({
    kind: "task",
    id: task.id,
    path: task.path,
    text: task.text,
    status: task.status,
    due_date: task.due_date,
    line_number: task.line_number,
    heading_path: null,
    level: null,
  }));

  for (const hit of sections) {
    rows.push({
      kind: "section",
      id: hit.heading_id,
      path: hit.note.path,
      text: hit.title,
      status: null,
      due_date: null,
      line_number: hit.start_line,
      heading_path: hit.heading_path,
      level: hit.level,
    });
  }
  return rows;
}

// Only a section row carries a line: `start_line` is the 0-based markdown line
// `note.open` scrolls to.
export function row_open_payload(row) {
  if (row.kind === "section") {
    return { note_path: row.path, line: row.line_number };
  }
  return { note_path: row.path };
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

export function restrict_rows(rows, paths) {
  if (paths === null) return rows;
  return rows.filter((row) => paths.has(row.path));
}

function compare_rows(a, b) {
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

export function sort_rows(rows) {
  return [...rows].sort(compare_rows);
}

// Dated tasks always sort ahead of sections, so a busy task pool would push
// every section past the row cap; sections get up to half the slots instead.
export function select_rows(rows, paths, max_items) {
  const pool = restrict_rows(rows, paths);
  const sections = sort_rows(pool.filter((row) => row.kind === "section"));
  const tasks = sort_rows(pool.filter((row) => row.kind !== "section"));
  const section_count = Math.min(sections.length, Math.floor(max_items / 2));
  const selected = [
    ...sections.slice(0, section_count),
    ...tasks.slice(0, max_items - section_count),
  ];
  return sort_rows(selected);
}

// The track is N copies of the group and the loop shifts by one group, so
// the copies after the first must still cover the viewport at the end of a
// pass; otherwise a short list scrolls a blank gap into view every loop.
export function track_copies(group_height, viewport_height) {
  if (group_height <= 0) return 2;
  return Math.max(2, Math.ceil(viewport_height / group_height) + 1);
}
