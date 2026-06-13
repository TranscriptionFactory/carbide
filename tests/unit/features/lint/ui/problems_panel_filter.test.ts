import { describe, expect, it } from "vitest";
import {
  filter_diagnostics,
  filter_logs,
  build_unified_entries,
} from "$lib/features/lint/ui/problems_panel_filter";
import type { Diagnostic } from "$lib/features/diagnostics";
import type { LogEntry } from "$lib/features/lint/state/log_store.svelte";

function make_diagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    source: "lint",
    line: 1,
    column: 1,
    end_line: 1,
    end_column: 5,
    severity: "error",
    message: "test diagnostic",
    rule_id: null,
    fixable: false,
    ...overrides,
  };
}

function make_log_entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    level: "error",
    message: "test log",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("problems_panel_filter", () => {
  describe("filter_diagnostics", () => {
    it("returns all diagnostics when severity is 'all'", () => {
      const items = [
        make_diagnostic({ severity: "error" }),
        make_diagnostic({ severity: "warning" }),
        make_diagnostic({ severity: "info" }),
      ];
      expect(filter_diagnostics(items, "all", "all", "")).toHaveLength(3);
    });

    it("filters diagnostics by error severity", () => {
      const items = [
        make_diagnostic({ severity: "error" }),
        make_diagnostic({ severity: "warning" }),
      ];
      const result = filter_diagnostics(items, "error", "all", "");
      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe("error");
    });

    it("excludes diagnostics when severity is 'debug' (no diagnostic equivalent)", () => {
      const items = [make_diagnostic({ severity: "error" })];
      expect(filter_diagnostics(items, "debug", "all", "")).toHaveLength(0);
    });

    it("excludes diagnostics when severity is 'trace'", () => {
      const items = [make_diagnostic({ severity: "info" })];
      expect(filter_diagnostics(items, "trace", "all", "")).toHaveLength(0);
    });

    it("filters by source", () => {
      const items = [
        make_diagnostic({ source: "lint" }),
        make_diagnostic({ source: "ast" }),
      ];
      const result = filter_diagnostics(items, "all", "lint", "");
      expect(result).toHaveLength(1);
      expect(result[0].source).toBe("lint");
    });

    it("filters by search query against message", () => {
      const items = [
        make_diagnostic({ message: "unused variable" }),
        make_diagnostic({ message: "missing semicolon" }),
      ];
      const result = filter_diagnostics(items, "all", "all", "unused");
      expect(result).toHaveLength(1);
      expect(result[0].message).toBe("unused variable");
    });

    it("filters by search query against rule_id", () => {
      const items = [
        make_diagnostic({ rule_id: "no-unused-vars", message: "error" }),
        make_diagnostic({ rule_id: "semi", message: "error" }),
      ];
      const result = filter_diagnostics(items, "all", "all", "unused");
      expect(result).toHaveLength(1);
      expect(result[0].rule_id).toBe("no-unused-vars");
    });
  });

  describe("filter_logs", () => {
    it("returns all log entries when severity is 'all'", () => {
      const items = [
        make_log_entry({ level: "error" }),
        make_log_entry({ level: "warn" }),
        make_log_entry({ level: "trace" }),
      ];
      expect(filter_logs(items, "all", "")).toHaveLength(3);
    });

    it("filters log entries by error level", () => {
      const items = [
        make_log_entry({ level: "error" }),
        make_log_entry({ level: "warn" }),
        make_log_entry({ level: "info" }),
      ];
      const result = filter_logs(items, "error", "");
      expect(result).toHaveLength(1);
      expect(result[0].level).toBe("error");
    });

    it("filters log entries by warning level (warn maps to warning)", () => {
      const items = [
        make_log_entry({ level: "warn" }),
        make_log_entry({ level: "error" }),
      ];
      const result = filter_logs(items, "warning", "");
      expect(result).toHaveLength(1);
      expect(result[0].level).toBe("warn");
    });

    it("filters log entries by info level", () => {
      const items = [
        make_log_entry({ level: "info" }),
        make_log_entry({ level: "debug" }),
      ];
      const result = filter_logs(items, "info", "");
      expect(result).toHaveLength(1);
      expect(result[0].level).toBe("info");
    });

    it("only matches trace level when severity is 'trace'", () => {
      const items = [
        make_log_entry({ level: "trace" }),
        make_log_entry({ level: "debug" }),
        make_log_entry({ level: "info" }),
      ];
      const result = filter_logs(items, "trace", "");
      expect(result).toHaveLength(1);
      expect(result[0].level).toBe("trace");
    });

    it("excludes log entries when severity is 'hint' (no log equivalent)", () => {
      const items = [make_log_entry({ level: "info" })];
      expect(filter_logs(items, "hint", "")).toHaveLength(0);
    });

    it("filters by search query", () => {
      const items = [
        make_log_entry({ message: "app started" }),
        make_log_entry({ message: "connection failed" }),
      ];
      const result = filter_logs(items, "all", "started");
      expect(result).toHaveLength(1);
      expect(result[0].message).toBe("app started");
    });
  });

  describe("build_unified_entries — severity filter applies to both streams", () => {
    it("'error' severity filter returns both a diagnostic and a log entry with error level", () => {
      const diag = make_diagnostic({ severity: "error" });
      const log = make_log_entry({ level: "error", timestamp: 1000 });

      const result = build_unified_entries(
        "all",
        [diag],
        [log],
        "error",
        "all",
        "",
      );

      expect(result).toHaveLength(2);
      const kinds = result.map((e) => e.kind);
      expect(kinds).toContain("diagnostic");
      expect(kinds).toContain("log");
    });

    it("'error' severity filter excludes warning diagnostics and warn log entries", () => {
      const diag_warn = make_diagnostic({ severity: "warning" });
      const log_warn = make_log_entry({ level: "warn" });
      const diag_err = make_diagnostic({ severity: "error" });
      const log_err = make_log_entry({ level: "error", timestamp: 1000 });

      const result = build_unified_entries(
        "all",
        [diag_warn, diag_err],
        [log_warn, log_err],
        "error",
        "all",
        "",
      );

      expect(result).toHaveLength(2);
      expect(
        result.every((e) => {
          if (e.kind === "diagnostic") return e.data.severity === "error";
          if (e.kind === "log") return e.data.level === "error";
          return false;
        }),
      ).toBe(true);
    });

    it("'trace' severity only matches log entries with level 'trace'", () => {
      const diag = make_diagnostic({ severity: "error" });
      const log_trace = make_log_entry({ level: "trace", timestamp: 1000 });
      const log_debug = make_log_entry({ level: "debug", timestamp: 2000 });

      const result = build_unified_entries(
        "all",
        [diag],
        [log_trace, log_debug],
        "trace",
        "all",
        "",
      );

      expect(result).toHaveLength(1);
      expect(result[0].kind).toBe("log");
      expect((result[0].data as { level: string }).level).toBe("trace");
    });

    it("stream 'diagnostics' shows only diagnostics regardless of log entries", () => {
      const diag = make_diagnostic({ severity: "error" });
      const log = make_log_entry({ level: "error" });

      const result = build_unified_entries(
        "diagnostics",
        [diag],
        [log],
        "all",
        "all",
        "",
      );

      expect(result).toHaveLength(1);
      expect(result[0].kind).toBe("diagnostic");
    });

    it("stream 'logs' shows only log entries regardless of diagnostics", () => {
      const diag = make_diagnostic({ severity: "error" });
      const log = make_log_entry({ level: "error" });

      const result = build_unified_entries(
        "logs",
        [diag],
        [log],
        "all",
        "all",
        "",
      );

      expect(result).toHaveLength(1);
      expect(result[0].kind).toBe("log");
    });

    it("stream 'all' merges and sorts by timestamp", () => {
      const log_early = make_log_entry({ level: "info", timestamp: 100 });
      const log_late = make_log_entry({ level: "debug", timestamp: 300 });

      const result = build_unified_entries(
        "all",
        [],
        [log_late, log_early],
        "all",
        "all",
        "",
      );

      expect(result[0].timestamp).toBe(100);
      expect(result[1].timestamp).toBe(300);
    });
  });
});
