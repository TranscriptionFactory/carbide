import type { Diagnostic } from "$lib/features/diagnostics";
import type { LogEntry } from "$lib/features/lint/state/log_store.svelte";

export type StreamFilter = "diagnostics" | "logs";

export type SeverityFilter =
  | "all"
  | "error"
  | "warning"
  | "info"
  | "hint"
  | "debug"
  | "trace";

export type SeverityOption = { value: SeverityFilter; label: string };

const DIAGNOSTIC_SEVERITY_OPTIONS: SeverityOption[] = [
  { value: "all", label: "All Levels" },
  { value: "error", label: "Errors" },
  { value: "warning", label: "Warnings" },
  { value: "info", label: "Info" },
  { value: "hint", label: "Hints" },
];

const LOG_SEVERITY_OPTIONS: SeverityOption[] = [
  { value: "all", label: "All Levels" },
  { value: "error", label: "Errors" },
  { value: "warning", label: "Warnings" },
  { value: "info", label: "Info" },
  { value: "debug", label: "Debug" },
  { value: "trace", label: "Trace" },
];

export function severity_options(stream: StreamFilter): SeverityOption[] {
  return stream === "logs" ? LOG_SEVERITY_OPTIONS : DIAGNOSTIC_SEVERITY_OPTIONS;
}

function log_level_to_severity(level: LogEntry["level"]): SeverityFilter {
  return level === "warn" ? "warning" : level;
}

export function filter_diagnostics(
  diagnostics: Diagnostic[],
  severity: SeverityFilter,
  source_filter: string,
  search_query: string,
): Diagnostic[] {
  let items = diagnostics;
  if (severity !== "all") {
    items = items.filter((d) => (d.severity as string) === severity);
  }
  if (source_filter !== "all") {
    items = items.filter((d) => d.source === source_filter);
  }
  if (search_query) {
    const q = search_query.toLowerCase();
    items = items.filter(
      (d) =>
        d.message.toLowerCase().includes(q) ||
        (d.rule_id && d.rule_id.toLowerCase().includes(q)),
    );
  }
  return items;
}

export function filter_logs(
  logs: LogEntry[],
  severity: SeverityFilter,
  search_query: string,
): LogEntry[] {
  let items = logs;
  if (severity !== "all") {
    items = items.filter((e) => log_level_to_severity(e.level) === severity);
  }
  if (search_query) {
    const q = search_query.toLowerCase();
    items = items.filter((e) => e.message.toLowerCase().includes(q));
  }
  return items;
}

export type FileGroup = { path: string; diagnostics: Diagnostic[] };

const SEVERITY_RANK: Record<Diagnostic["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
  hint: 3,
};

export function filter_file_groups(
  files: FileGroup[],
  severity: SeverityFilter,
  source_filter: string,
  search_query: string,
): FileGroup[] {
  const result: FileGroup[] = [];
  for (const file of files) {
    const diagnostics = filter_diagnostics(
      file.diagnostics,
      severity,
      source_filter,
      search_query,
    );
    if (diagnostics.length === 0) continue;
    result.push({
      path: file.path,
      diagnostics: [...diagnostics].sort(
        (a, b) =>
          SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
          a.line - b.line ||
          a.column - b.column,
      ),
    });
  }
  return result;
}

export function line_col_to_offset(
  text: string,
  line: number,
  column: number,
): number | null {
  if (line < 1) return null;
  let offset = 0;
  let current = 1;
  while (current < line) {
    const next = text.indexOf("\n", offset);
    if (next === -1) return null;
    offset = next + 1;
    current++;
  }
  const line_end = text.indexOf("\n", offset);
  const line_length = (line_end === -1 ? text.length : line_end) - offset;
  return offset + Math.min(Math.max(0, column - 1), line_length);
}
