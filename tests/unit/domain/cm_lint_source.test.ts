import { describe, it, expect, vi } from "vitest";
import { Text } from "@codemirror/state";
import { map_lint_diagnostics } from "$lib/features/lint/editor/cm_lint_source";
import type { Diagnostic } from "$lib/features/diagnostics/types/diagnostics";

function make_doc(content: string): Text {
  return Text.of(content.split("\n"));
}

describe("map_lint_diagnostics", () => {
  it("returns empty array for empty diagnostics", () => {
    const doc = make_doc("hello");
    expect(map_lint_diagnostics(doc, [])).toEqual([]);
  });

  it("maps a single diagnostic with correct positions", () => {
    const doc = make_doc("# Hello\n\nWorld");
    const diag: Diagnostic = {
      source: "lint",
      line: 3,
      column: 1,
      end_line: 3,
      end_column: 6,
      severity: "warning",
      message: "Test warning",
      rule_id: "MD001",
      fixable: false,
    };
    const result = map_lint_diagnostics(doc, [diag]);

    expect(result).toHaveLength(1);
    expect(result[0]!.from).toBe(9);
    expect(result[0]!.to).toBe(14);
    expect(result[0]!.severity).toBe("warning");
    expect(result[0]!.message).toBe("Test warning");
    expect(result[0]!.source).toBe("MD001");
  });

  it("maps severity correctly", () => {
    const doc = make_doc("test");
    const base: Diagnostic = {
      source: "lint",
      line: 1,
      column: 1,
      end_line: 1,
      end_column: 5,
      message: "msg",
      rule_id: null,
      fixable: false,
      severity: "error",
    };

    const error_result = map_lint_diagnostics(doc, [
      { ...base, severity: "error" },
    ]);
    expect(error_result[0]!.severity).toBe("error");

    const warn_result = map_lint_diagnostics(doc, [
      { ...base, severity: "warning" },
    ]);
    expect(warn_result[0]!.severity).toBe("warning");

    const info_result = map_lint_diagnostics(doc, [
      { ...base, severity: "info" },
    ]);
    expect(info_result[0]!.severity).toBe("info");

    const hint_result = map_lint_diagnostics(doc, [
      { ...base, severity: "hint" },
    ]);
    expect(hint_result[0]!.severity).toBe("info");
  });

  it("omits source when rule_id is null", () => {
    const doc = make_doc("test");
    const diag: Diagnostic = {
      source: "lint",
      line: 1,
      column: 1,
      end_line: 1,
      end_column: 5,
      severity: "warning",
      message: "msg",
      rule_id: null,
      fixable: false,
    };
    const result = map_lint_diagnostics(doc, [diag]);
    expect(result[0]!.source).toBeUndefined();
  });

  it("adds Fix All action for fixable diagnostics", () => {
    const doc = make_doc("test");
    const on_fix_all = vi.fn();
    const diag: Diagnostic = {
      source: "lint",
      line: 1,
      column: 1,
      end_line: 1,
      end_column: 5,
      severity: "warning",
      message: "msg",
      rule_id: "MD001",
      fixable: true,
    };
    const result = map_lint_diagnostics(doc, [diag], on_fix_all);

    expect(result[0]!.actions).toHaveLength(1);
    expect(result[0]!.actions![0]!.name).toBe("Fix All");
  });

  it("skips diagnostics with out-of-range lines", () => {
    const doc = make_doc("line1\nline2");
    const diag: Diagnostic = {
      source: "lint",
      line: 5,
      column: 1,
      end_line: 5,
      end_column: 3,
      severity: "error",
      message: "out of range",
      rule_id: null,
      fixable: false,
    };
    expect(map_lint_diagnostics(doc, [diag])).toEqual([]);
  });

  it("clamps positions to document length", () => {
    const doc = make_doc("ab");
    const diag: Diagnostic = {
      source: "lint",
      line: 1,
      column: 1,
      end_line: 1,
      end_column: 100,
      severity: "warning",
      message: "test",
      rule_id: null,
      fixable: false,
    };
    const result = map_lint_diagnostics(doc, [diag]);
    expect(result[0]!.to).toBe(doc.length);
  });

  it("maps multiple diagnostics", () => {
    const doc = make_doc("# Hello\n\n## World");
    const diags: Diagnostic[] = [
      {
        source: "lint",
        line: 1,
        column: 1,
        end_line: 1,
        end_column: 8,
        severity: "warning",
        message: "first",
        rule_id: "MD001",
        fixable: false,
      },
      {
        source: "lint",
        line: 3,
        column: 1,
        end_line: 3,
        end_column: 9,
        severity: "error",
        message: "second",
        rule_id: "MD002",
        fixable: false,
      },
    ];
    const result = map_lint_diagnostics(doc, diags);
    expect(result).toHaveLength(2);
    expect(result[0]!.message).toBe("first");
    expect(result[1]!.message).toBe("second");
  });
});
