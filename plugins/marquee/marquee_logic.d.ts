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
  show_note_name: boolean;
  max_items: number;
  scroll_seconds: number;
  poll_seconds: number;
  theme: "auto" | "light" | "dark";
}

export const POOL_LIMIT: number;

export const BASE_ROW_LIMIT: number;

export function normalize_settings(raw: unknown): MarqueeSettings;

export function parse_tag_list(raw: unknown): string[];

export function build_task_filter(
  settings: MarqueeSettings,
): TaskFilterExpr | null;

export function merge_note_sets(
  sets: Array<string[] | null | undefined>,
): Set<string> | null;

export function restrict_to_notes(
  tasks: Task[],
  paths: Set<string> | null,
): Task[];

export function sort_tasks(tasks: Task[]): Task[];

export function select_tasks(
  tasks: Task[],
  paths: Set<string> | null,
  max_items: number,
): Task[];

export function track_copies(
  group_height: number,
  viewport_height: number,
): number;
