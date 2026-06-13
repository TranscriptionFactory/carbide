import type { Diagnostic, DiagnosticSeverity } from "$lib/features/diagnostics";
import type { LogEntry } from "$lib/features/lint/state/log_store.svelte";

export type StreamFilter = "all" | "diagnostics" | "logs";

export type SeverityFilter =
  | "all"
  | "error"
  | "warning"
  | "info"
  | "hint"
  | "debug"
  | "trace";

export type UnifiedEntry =
  | { kind: "diagnostic"; data: Diagnostic; timestamp?: undefined }
  | { kind: "log"; data: LogEntry; timestamp: number };

function log_level_to_severity(level: LogEntry["level"]): SeverityFilter {
  switch (level) {
    case "error":
      return "error";
    case "warn":
      return "warning";
    case "info":
      return "info";
    case "debug":
      return "debug";
    case "trace":
      return "trace";
  }
}

function diagnostic_matches_severity(
  d: Diagnostic,
  severity: SeverityFilter,
): boolean {
  if (severity === "all") return true;
  if (severity === "debug" || severity === "trace") return false;
  return (d.severity as string) === (severity as string);
}

function log_matches_severity(e: LogEntry, severity: SeverityFilter): boolean {
  if (severity === "all") return true;
  if (severity === "hint") return false;
  return log_level_to_severity(e.level) === severity;
}

export function filter_diagnostics(
  diagnostics: Diagnostic[],
  severity: SeverityFilter,
  source_filter: string,
  search_query: string,
): Diagnostic[] {
  let items = diagnostics;
  if (severity !== "all") {
    items = items.filter((d) => diagnostic_matches_severity(d, severity));
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
    items = items.filter((e) => log_matches_severity(e, severity));
  }
  if (search_query) {
    const q = search_query.toLowerCase();
    items = items.filter((e) => e.message.toLowerCase().includes(q));
  }
  return items;
}

export function build_unified_entries(
  stream: StreamFilter,
  diagnostics: Diagnostic[],
  logs: LogEntry[],
  severity: SeverityFilter,
  source_filter: string,
  search_query: string,
): UnifiedEntry[] {
  const include_diagnostics = stream === "all" || stream === "diagnostics";
  const include_logs = stream === "all" || stream === "logs";

  const diagnostic_entries: UnifiedEntry[] = include_diagnostics
    ? filter_diagnostics(
        diagnostics,
        severity,
        source_filter,
        search_query,
      ).map((d) => ({ kind: "diagnostic" as const, data: d }))
    : [];

  const log_entries: UnifiedEntry[] = include_logs
    ? filter_logs(logs, severity, search_query).map((e) => ({
        kind: "log" as const,
        data: e,
        timestamp: e.timestamp,
      }))
    : [];

  if (stream !== "all") {
    return stream === "diagnostics" ? diagnostic_entries : log_entries;
  }

  return [...diagnostic_entries, ...log_entries].sort(
    (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
  );
}
