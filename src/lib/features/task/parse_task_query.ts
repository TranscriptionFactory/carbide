import type {
  TaskFilter,
  TaskGrouping,
  TaskQuery,
  TaskSort,
} from "./types";

export type ParsedTaskQuery = {
  query: TaskQuery;
  grouping: TaskGrouping;
  errors: string[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SORTABLE_PROPS = new Set([
  "status",
  "text",
  "path",
  "due_date",
  "section",
]);
const GROUPABLE_PROPS = new Set(["status", "note", "section", "due_date"]);

function parse_status_clause(rest: string): TaskFilter | null {
  const match = rest.match(/^is\s+(todo|doing|done)$/);
  if (!match) return null;
  return { property: "status", operator: "eq", value: match[1]! };
}

function parse_date_comparator(
  rest: string,
): { operator: TaskFilter["operator"]; value: string } | null {
  const today_match = rest.match(/^today$/i);
  if (today_match) {
    const today = new Date().toISOString().slice(0, 10);
    return { operator: "eq", value: today };
  }

  const cmp_match = rest.match(/^(before|after|on)\s+(\S+)$/);
  if (!cmp_match) return null;

  const [, direction, date_str] = cmp_match;
  if (!DATE_RE.test(date_str!)) return null;

  const op_map: Record<string, TaskFilter["operator"]> = {
    before: "lt",
    after: "gt",
    on: "eq",
  };
  return { operator: op_map[direction!]!, value: date_str! };
}

function parse_line(
  line: string,
): { filter?: TaskFilter; sort?: TaskSort; grouping?: TaskGrouping; limit?: number } | string {
  const trimmed = line.trim();

  if (trimmed === "done") {
    return { filter: { property: "status", operator: "eq", value: "done" } };
  }
  if (trimmed === "not done") {
    return { filter: { property: "status", operator: "neq", value: "done" } };
  }

  const status_match = trimmed.match(/^status\s+(.+)$/);
  if (status_match) {
    const f = parse_status_clause(status_match[1]!);
    if (f) return { filter: f };
    return `Invalid status clause: ${trimmed}`;
  }

  for (const prop of ["path", "section", "text"]) {
    const re = new RegExp(`^${prop}\\s+includes\\s+(.+)$`);
    const m = trimmed.match(re);
    if (m) {
      return {
        filter: { property: prop, operator: "contains", value: m[1]! },
      };
    }
  }

  const due_match = trimmed.match(/^due\s+(.+)$/);
  if (due_match) {
    const result = parse_date_comparator(due_match[1]!);
    if (result) {
      return {
        filter: {
          property: "due_date",
          operator: result.operator,
          value: result.value,
        },
      };
    }
    return `Invalid due clause: ${trimmed}`;
  }

  if (trimmed === "has due date") {
    return {
      filter: { property: "due_date", operator: "neq", value: "" },
    };
  }
  if (trimmed === "no due date") {
    return {
      filter: { property: "due_date", operator: "eq", value: "" },
    };
  }

  const sort_match = trimmed.match(/^sort\s+by\s+(\S+)(?:\s+(desc))?$/);
  if (sort_match) {
    const prop = sort_match[1]!;
    if (!SORTABLE_PROPS.has(prop)) {
      return `Unknown sort property: ${prop}`;
    }
    return { sort: { property: prop, descending: !!sort_match[2] } };
  }

  const group_match = trimmed.match(/^group\s+by\s+(\S+)$/);
  if (group_match) {
    const prop = group_match[1]!;
    if (!GROUPABLE_PROPS.has(prop)) {
      return `Unknown group property: ${prop}`;
    }
    return { grouping: prop as TaskGrouping };
  }

  const limit_match = trimmed.match(/^limit\s+(\d+)$/);
  if (limit_match) {
    return { limit: parseInt(limit_match[1]!, 10) };
  }

  return `Unknown clause: ${trimmed}`;
}

export function parse_task_query(input: string): ParsedTaskQuery {
  const filters: TaskFilter[] = [];
  const sort: TaskSort[] = [];
  const errors: string[] = [];
  let grouping: TaskGrouping = "none";
  let limit = 0;

  const lines = input.split("\n");
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;

    const result = parse_line(line);
    if (typeof result === "string") {
      errors.push(result);
      continue;
    }

    if (result.filter) filters.push(result.filter);
    if (result.sort) sort.push(result.sort);
    if (result.grouping) grouping = result.grouping;
    if (result.limit !== undefined) limit = result.limit;
  }

  return {
    query: { filters, sort, limit, offset: 0 },
    grouping,
    errors,
  };
}
