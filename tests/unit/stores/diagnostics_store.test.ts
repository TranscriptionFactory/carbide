import { describe, it, expect } from "vitest";
import { DiagnosticsStore } from "$lib/features/diagnostics/state/diagnostics_store.svelte";
import type { Diagnostic } from "$lib/features/diagnostics/types/diagnostics";

function make_diagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    source: "lint",
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

describe("DiagnosticsStore", () => {
  it("starts with empty state", () => {
    const store = new DiagnosticsStore();

    expect(store.active_file_path).toBe(null);
    expect(store.active_diagnostics).toEqual([]);
    expect(store.error_count).toBe(0);
    expect(store.warning_count).toBe(0);
    expect(store.total_count).toBe(0);
  });

  it("pushes diagnostics per source and file", () => {
    const store = new DiagnosticsStore();
    const diag = make_diagnostic({ source: "lint" });

    store.push("lint", "a.md", [diag]);
    store.set_active_file("a.md");

    expect(store.active_diagnostics).toHaveLength(1);
    expect(store.active_diagnostics[0]!.source).toBe("lint");
  });

  it("merges diagnostics from multiple sources for the same file", () => {
    const store = new DiagnosticsStore();
    store.push("lint", "a.md", [
      make_diagnostic({ source: "lint", message: "lint issue" }),
    ]);
    store.push("markdown_lsp", "a.md", [
      make_diagnostic({
        source: "markdown_lsp",
        message: "markdown_lsp issue",
      }),
    ]);
    store.set_active_file("a.md");

    expect(store.active_diagnostics).toHaveLength(2);
    const sources = store.active_diagnostics.map((d) => d.source);
    expect(sources).toContain("lint");
    expect(sources).toContain("markdown_lsp");
  });

  it("lint and markdown_lsp diagnostics do not overwrite each other", () => {
    const store = new DiagnosticsStore();
    store.push("lint", "a.md", [make_diagnostic({ source: "lint" })]);
    store.push("markdown_lsp", "a.md", [
      make_diagnostic({ source: "markdown_lsp" }),
    ]);

    store.push("lint", "a.md", [
      make_diagnostic({ source: "lint", message: "updated" }),
    ]);

    store.set_active_file("a.md");
    expect(store.active_diagnostics).toHaveLength(2);
  });

  it("removes file entry for source when diagnostics are empty", () => {
    const store = new DiagnosticsStore();
    store.push("lint", "a.md", [make_diagnostic()]);
    store.push("lint", "a.md", []);

    store.set_active_file("a.md");
    expect(store.active_diagnostics).toHaveLength(0);
  });

  it("counts errors and warnings across all sources", () => {
    const store = new DiagnosticsStore();
    store.push("lint", "a.md", [
      make_diagnostic({ source: "lint", severity: "error" }),
      make_diagnostic({ source: "lint", severity: "warning" }),
    ]);
    store.push("markdown_lsp", "b.md", [
      make_diagnostic({ source: "markdown_lsp", severity: "error" }),
    ]);

    expect(store.error_count).toBe(2);
    expect(store.warning_count).toBe(1);
    expect(store.total_count).toBe(3);
  });

  it("clears all diagnostics for a source", () => {
    const store = new DiagnosticsStore();
    store.push("lint", "a.md", [make_diagnostic()]);
    store.push("markdown_lsp", "a.md", [
      make_diagnostic({ source: "markdown_lsp" }),
    ]);

    store.clear_source("lint");
    store.set_active_file("a.md");

    const sources = store.active_diagnostics.map((d) => d.source);
    expect(sources).not.toContain("lint");
    expect(sources).toContain("markdown_lsp");
  });

  it("clears diagnostics for a specific source and file — cleared file is empty", () => {
    const store = new DiagnosticsStore();
    store.push("lint", "a.md", [make_diagnostic()]);
    store.push("lint", "b.md", [make_diagnostic()]);

    store.clear_file("lint", "a.md");
    store.set_active_file("a.md");

    expect(store.active_diagnostics).toHaveLength(0);
  });

  it("clears diagnostics for a specific source and file — other file unaffected", () => {
    const store = new DiagnosticsStore();
    store.push("lint", "a.md", [make_diagnostic()]);
    store.push("lint", "b.md", [make_diagnostic()]);

    store.clear_file("lint", "a.md");
    store.set_active_file("b.md");

    expect(store.active_diagnostics).toHaveLength(1);
  });

  it("returns empty active_diagnostics when no active file", () => {
    const store = new DiagnosticsStore();
    store.push("lint", "a.md", [make_diagnostic()]);

    expect(store.active_diagnostics).toHaveLength(0);
  });

  it("returns empty active_diagnostics for file with no diagnostics", () => {
    const store = new DiagnosticsStore();
    store.push("lint", "a.md", [make_diagnostic()]);
    store.set_active_file("b.md");

    expect(store.active_diagnostics).toHaveLength(0);
  });

  it("set_active_file updates active_file_path", () => {
    const store = new DiagnosticsStore();

    store.set_active_file("a.md");
    expect(store.active_file_path).toBe("a.md");

    store.set_active_file(null);
    expect(store.active_file_path).toBe(null);
  });

  it("reset clears all state", () => {
    const store = new DiagnosticsStore();
    store.push("lint", "a.md", [make_diagnostic({ severity: "error" })]);
    store.push("markdown_lsp", "b.md", [
      make_diagnostic({ source: "markdown_lsp" }),
    ]);
    store.set_active_file("a.md");

    store.reset();

    expect(store.active_file_path).toBe(null);
    expect(store.active_diagnostics).toHaveLength(0);
    expect(store.error_count).toBe(0);
    expect(store.warning_count).toBe(0);
  });

  it("clear_file is no-op for unknown source", () => {
    const store = new DiagnosticsStore();
    store.push("lint", "a.md", [make_diagnostic()]);

    store.clear_file("markdown_lsp", "a.md");

    store.set_active_file("a.md");
    expect(store.active_diagnostics).toHaveLength(1);
  });
});
