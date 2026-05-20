import type {
  FilterExpr,
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

function parse_atom(trimmed: string): TaskFilter | string {
  if (trimmed === "done") {
    return { property: "status", operator: "eq", value: "done" };
  }
  if (trimmed === "not done") {
    return { property: "status", operator: "neq", value: "done" };
  }

  const status_match = trimmed.match(/^status\s+(.+)$/);
  if (status_match) {
    const f = parse_status_clause(status_match[1]!);
    if (f) return f;
    return `Invalid status clause: ${trimmed}`;
  }

  for (const prop of ["path", "section", "text"]) {
    const re = new RegExp(`^${prop}\\s+includes\\s+(.+)$`);
    const m = trimmed.match(re);
    if (m) {
      return { property: prop, operator: "contains", value: m[1]! };
    }
  }

  const due_match = trimmed.match(/^due\s+(.+)$/);
  if (due_match) {
    const result = parse_date_comparator(due_match[1]!);
    if (result) {
      return {
        property: "due_date",
        operator: result.operator,
        value: result.value,
      };
    }
    return `Invalid due clause: ${trimmed}`;
  }

  if (trimmed === "has due date") {
    return { property: "due_date", operator: "neq", value: "" };
  }
  if (trimmed === "no due date") {
    return { property: "due_date", operator: "eq", value: "" };
  }

  return `Unknown clause: ${trimmed}`;
}

function split_at_top_level(line: string, keyword: string): string[] | null {
  const sep = ` ${keyword} `;
  let depth = 0;
  const positions: number[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "(") depth++;
    else if (line[i] === ")") depth--;
    if (
      depth === 0 &&
      line.substring(i, i + sep.length).toUpperCase() === sep.toUpperCase()
    ) {
      positions.push(i);
    }
  }
  if (positions.length === 0) return null;
  const parts: string[] = [];
  let start = 0;
  for (const pos of positions) {
    parts.push(line.substring(start, pos).trim());
    start = pos + sep.length;
  }
  parts.push(line.substring(start).trim());
  return parts;
}

function strip_outer_parens(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) return null;
  let depth = 0;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "(") depth++;
    else if (trimmed[i] === ")") depth--;
    if (depth === 0 && i < trimmed.length - 1) return null;
  }
  return trimmed.slice(1, -1).trim();
}

function parse_filter_expr(line: string): FilterExpr | string {
  const trimmed = line.trim();

  const or_parts = split_at_top_level(trimmed, "OR");
  if (or_parts) {
    const operands: FilterExpr[] = [];
    for (const part of or_parts) {
      const result = parse_filter_expr(part);
      if (typeof result === "string") return result;
      operands.push(result);
    }
    return { type: "or", operands };
  }

  const and_parts = split_at_top_level(trimmed, "AND");
  if (and_parts) {
    const operands: FilterExpr[] = [];
    for (const part of and_parts) {
      const result = parse_filter_expr(part);
      if (typeof result === "string") return result;
      operands.push(result);
    }
    return { type: "and", operands };
  }

  const not_match = trimmed.match(/^NOT\s+(\(.+)$/i);
  if (not_match) {
    const inner = parse_filter_expr(not_match[1]!);
    if (typeof inner === "string") return inner;
    return { type: "not", operand: inner };
  }

  const stripped = strip_outer_parens(trimmed);
  if (stripped !== null) {
    return parse_filter_expr(stripped);
  }

  const atom = parse_atom(trimmed);
  if (typeof atom === "string") return atom;
  return { type: "atom", filter: atom };
}

type ParsedLine =
  | {
      filter?: FilterExpr;
      sort?: TaskSort;
      grouping?: TaskGrouping;
      limit?: number;
    }
  | string;

function parse_line(line: string): ParsedLine {
  const trimmed = line.trim();

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

  const expr = parse_filter_expr(trimmed);
  if (typeof expr === "string") return expr;
  return { filter: expr };
}

export function parse_task_query(input: string): ParsedTaskQuery {
  const filter_exprs: FilterExpr[] = [];
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

    if (result.filter) filter_exprs.push(result.filter);
    if (result.sort) sort.push(result.sort);
    if (result.grouping) grouping = result.grouping;
    if (result.limit !== undefined) limit = result.limit;
  }

  let filter: FilterExpr | null = null;
  if (filter_exprs.length === 1) {
    filter = filter_exprs[0]!;
  } else if (filter_exprs.length > 1) {
    filter = { type: "and", operands: filter_exprs };
  }

  return {
    query: { filter, sort, limit, offset: 0 },
    grouping,
    errors,
  };
}
