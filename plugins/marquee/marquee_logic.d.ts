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

export type TaskFilterExpr =
  | {
      type: "atom";
      filter: { property: string; operator: string; value: string };
    }
  | { type: "and"; operands: TaskFilterExpr[] };

/** The structured filter `sections.query` takes; `limit` is always set. */
export interface SectionFilter {
  title?: string;
  title_is_regex?: boolean;
  level_min?: number;
  level_max?: number;
  path_prefix?: string;
  heading_path_under?: string;
  min_words?: number;
  limit: number;
}

/** One heading section as `sections.query` returns it; lines are 0-based. */
export interface SectionHit {
  note: { path: string };
  heading_id: string;
  title: string;
  level: number;
  heading_path: string;
  start_line: number;
  end_line: number;
  word_count: number;
}

/** A task row and a section row share one shape so they interleave. */
export interface MarqueeRow {
  kind: "task" | "section";
  id: string;
  path: string;
  text: string;
  status: TaskStatus | null;
  due_date: string | null;
  line_number: number;
  heading_path: string | null;
  level: number | null;
}

export interface MarqueeSettings {
  status: "all" | "open" | "todo" | "doing" | "done";
  text: string;
  due: "any" | "overdue" | "today" | "next_7_days";
  tags: string;
  base_property: string;
  base_operator:
    | "eq"
    | "neq"
    | "contains"
    | "not_contains"
    | "gt"
    | "lt"
    | "gte"
    | "lte";
  base_value: string;
  section_title: string;
  section_level: "any" | "1" | "2" | "3";
  section_under: string;
  show_note_name: boolean;
  max_items: number;
  scroll_seconds: number;
  poll_seconds: number;
  theme: "auto" | "light" | "dark";
}

export const POOL_LIMIT: number;

export const BASE_ROW_LIMIT: number;

export const SECTION_POOL_LIMIT: number;

export function normalize_settings(raw: unknown): MarqueeSettings;

export function parse_tag_list(raw: unknown): string[];

export function build_task_filter(
  settings: MarqueeSettings,
): TaskFilterExpr | null;

export function build_section_filter(
  settings: MarqueeSettings,
): SectionFilter | null;

export function build_rows(tasks: Task[], sections: SectionHit[]): MarqueeRow[];

export function row_open_payload(row: MarqueeRow): {
  note_path: string;
  line?: number;
};

export function merge_note_sets(
  sets: Array<string[] | null | undefined>,
): Set<string> | null;

export function restrict_rows(
  rows: MarqueeRow[],
  paths: Set<string> | null,
): MarqueeRow[];

export function sort_rows(rows: MarqueeRow[]): MarqueeRow[];

export function select_rows(
  rows: MarqueeRow[],
  paths: Set<string> | null,
  max_items: number,
): MarqueeRow[];

export function track_copies(
  group_height: number,
  viewport_height: number,
): number;
