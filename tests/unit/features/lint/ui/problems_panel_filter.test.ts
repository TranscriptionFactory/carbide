import { describe, expect, it } from "vitest";
import {
  filter_diagnostics,
  filter_logs,
  filter_file_groups,
  severity_options,
  line_col_to_offset,
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
      expect(result[0]?.severity).toBe("error");
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
      expect(result[0]?.source).toBe("lint");
    });

    it("filters by search query against message", () => {
      const items = [
        make_diagnostic({ message: "unused variable" }),
        make_diagnostic({ message: "missing semicolon" }),
      ];
      const result = filter_diagnostics(items, "all", "all", "unused");
      expect(result).toHaveLength(1);
      expect(result[0]?.message).toBe("unused variable");
    });

    it("filters by search query against rule_id", () => {
      const items = [
        make_diagnostic({ rule_id: "no-unused-vars", message: "error" }),
        make_diagnostic({ rule_id: "semi", message: "error" }),
      ];
      const result = filter_diagnostics(items, "all", "all", "unused");
      expect(result).toHaveLength(1);
      expect(result[0]?.rule_id).toBe("no-unused-vars");
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
      expect(result[0]?.level).toBe("error");
    });

    it("filters log entries by warning level (warn maps to warning)", () => {
      const items = [
        make_log_entry({ level: "warn" }),
        make_log_entry({ level: "error" }),
      ];
      const result = filter_logs(items, "warning", "");
      expect(result).toHaveLength(1);
      expect(result[0]?.level).toBe("warn");
    });

    it("filters log entries by info level", () => {
      const items = [
        make_log_entry({ level: "info" }),
        make_log_entry({ level: "debug" }),
      ];
      const result = filter_logs(items, "info", "");
      expect(result).toHaveLength(1);
      expect(result[0]?.level).toBe("info");
    });

    it("only matches trace level when severity is 'trace'", () => {
      const items = [
        make_log_entry({ level: "trace" }),
        make_log_entry({ level: "debug" }),
        make_log_entry({ level: "info" }),
      ];
      const result = filter_logs(items, "trace", "");
      expect(result).toHaveLength(1);
      expect(result[0]?.level).toBe("trace");
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
      expect(result[0]?.message).toBe("app started");
    });
  });

  describe("severity_options", () => {
    it("offers diagnostic severities without debug/trace", () => {
      const values = severity_options("diagnostics").map((o) => o.value);
      expect(values).toEqual(["all", "error", "warning", "info", "hint"]);
    });

    it("offers log levels without hint", () => {
      const values = severity_options("logs").map((o) => o.value);
      expect(values).toEqual([
        "all",
        "error",
        "warning",
        "info",
        "debug",
        "trace",
      ]);
    });
  });

  describe("filter_file_groups", () => {
    it("drops files with no matching diagnostics", () => {
      const files = [
        { path: "a.md", diagnostics: [make_diagnostic({ severity: "error" })] },
        {
          path: "b.md",
          diagnostics: [make_diagnostic({ severity: "warning" })],
        },
      ];
      const result = filter_file_groups(files, "error", "all", "");
      expect(result).toHaveLength(1);
      expect(result[0]?.path).toBe("a.md");
    });

    it("sorts diagnostics by severity then line then column", () => {
      const files = [
        {
          path: "a.md",
          diagnostics: [
            make_diagnostic({ severity: "hint", line: 1 }),
            make_diagnostic({ severity: "error", line: 9 }),
            make_diagnostic({ severity: "error", line: 2, column: 8 }),
            make_diagnostic({ severity: "error", line: 2, column: 3 }),
            make_diagnostic({ severity: "warning", line: 5 }),
          ],
        },
      ];
      const result = filter_file_groups(files, "all", "all", "");
      const order = result[0]?.diagnostics.map(
        (d) => `${d.severity}:${d.line}:${d.column}`,
      );
      expect(order).toEqual([
        "error:2:3",
        "error:2:8",
        "error:9:1",
        "warning:5:1",
        "hint:1:1",
      ]);
    });

    it("applies source and search filters within each file", () => {
      const files = [
        {
          path: "a.md",
          diagnostics: [
            make_diagnostic({ source: "lint", message: "unused variable" }),
            make_diagnostic({ source: "ast", message: "unused variable" }),
            make_diagnostic({ source: "lint", message: "missing semicolon" }),
          ],
        },
      ];
      const result = filter_file_groups(files, "all", "lint", "unused");
      expect(result).toHaveLength(1);
      expect(result[0]?.diagnostics).toHaveLength(1);
      expect(result[0]?.diagnostics[0]?.message).toBe("unused variable");
    });
  });

  describe("line_col_to_offset", () => {
    const text = "alpha\nbravo\ncharlie";

    it("maps line 1 col 1 to offset 0", () => {
      expect(line_col_to_offset(text, 1, 1)).toBe(0);
    });

    it("maps later lines and columns", () => {
      expect(line_col_to_offset(text, 2, 3)).toBe(8);
      expect(line_col_to_offset(text, 3, 1)).toBe(12);
    });

    it("clamps column to line length", () => {
      expect(line_col_to_offset(text, 1, 99)).toBe(5);
    });

    it("returns null for out-of-range lines", () => {
      expect(line_col_to_offset(text, 0, 1)).toBeNull();
      expect(line_col_to_offset(text, 4, 1)).toBeNull();
    });
  });
});
