import { describe, it, expect } from "vitest";
import { LintStore } from "$lib/features/lint/state/lint_store.svelte";
import type { LintDiagnostic } from "$lib/features/lint/types/lint";

function make_diagnostic(
  overrides: Partial<LintDiagnostic> = {},
): LintDiagnostic {
  return {
    line: 1,
    column: 1,
    end_line: 1,
    end_column: 5,
    severity: "warning",
    message: "test message",
    rule_id: "MD001",
    fixable: false,
    ...overrides,
  };
}

describe("LintStore", () => {
  it("starts with empty state", () => {
    const store = new LintStore();

    expect(store.status).toBe("stopped");
    expect(store.active_file_path).toBe(null);
    expect(store.diagnostics_by_file.size).toBe(0);
  });

  it("tracks diagnostics per file", () => {
    const store = new LintStore();
    const diags = [make_diagnostic(), make_diagnostic({ severity: "error" })];

    store.set_diagnostics("file.md", diags);

    expect(store.diagnostics_by_file.get("file.md")).toHaveLength(2);
  });

  it("removes file entry when diagnostics are empty", () => {
    const store = new LintStore();
    store.set_diagnostics("file.md", [make_diagnostic()]);
    store.set_diagnostics("file.md", []);

    expect(store.diagnostics_by_file.has("file.md")).toBe(false);
  });

  it("sets and clears active file", () => {
    const store = new LintStore();

    store.set_active_file("a.md");
    expect(store.active_file_path).toBe("a.md");

    store.set_active_file(null);
    expect(store.active_file_path).toBe(null);
  });

  it("sets status", () => {
    const store = new LintStore();

    store.set_status("running");
    expect(store.status).toBe("running");

    store.set_status("starting");
    expect(store.status).toBe("starting");

    store.set_status({ error: { message: "crash" } });
    expect(store.status).toEqual({ error: { message: "crash" } });

    store.set_status("stopped");
    expect(store.status).toBe("stopped");
  });

  it("clears all diagnostics", () => {
    const store = new LintStore();
    store.set_diagnostics("a.md", [make_diagnostic()]);
    store.set_diagnostics("b.md", [make_diagnostic()]);

    store.clear_diagnostics();

    expect(store.diagnostics_by_file.size).toBe(0);
  });

  it("removes a single file", () => {
    const store = new LintStore();
    store.set_diagnostics("a.md", [make_diagnostic()]);
    store.set_diagnostics("b.md", [make_diagnostic()]);

    store.remove_file("a.md");

    expect(store.diagnostics_by_file.has("a.md")).toBe(false);
    expect(store.diagnostics_by_file.has("b.md")).toBe(true);
  });

  it("resets to initial state", () => {
    const store = new LintStore();
    store.set_status("running");
    store.set_active_file("a.md");
    store.set_diagnostics("a.md", [make_diagnostic()]);

    store.reset();

    expect(store.status).toBe("stopped");
    expect(store.active_file_path).toBe(null);
    expect(store.diagnostics_by_file.size).toBe(0);
  });

  it("overwrites diagnostics for same file", () => {
    const store = new LintStore();
    store.set_diagnostics("a.md", [
      make_diagnostic({ message: "first" }),
      make_diagnostic({ message: "second" }),
    ]);

    store.set_diagnostics("a.md", [make_diagnostic({ message: "replaced" })]);

    expect(store.diagnostics_by_file.get("a.md")).toHaveLength(1);
    expect(store.diagnostics_by_file.get("a.md")![0]!.message).toBe(
      "replaced",
    );
  });

  it("tracks multiple files independently", () => {
    const store = new LintStore();
    store.set_diagnostics("a.md", [
      make_diagnostic({ severity: "error" }),
      make_diagnostic({ severity: "error" }),
    ]);
    store.set_diagnostics("b.md", [make_diagnostic({ severity: "warning" })]);
    store.set_diagnostics("c.md", [make_diagnostic({ severity: "error" })]);

    expect(store.diagnostics_by_file.size).toBe(3);
    expect(store.diagnostics_by_file.get("a.md")).toHaveLength(2);
    expect(store.diagnostics_by_file.get("b.md")).toHaveLength(1);
    expect(store.diagnostics_by_file.get("c.md")).toHaveLength(1);
  });

  it("remove_file is no-op for unknown path", () => {
    const store = new LintStore();
    store.set_diagnostics("a.md", [make_diagnostic()]);

    store.remove_file("unknown.md");

    expect(store.diagnostics_by_file.size).toBe(1);
  });
});
