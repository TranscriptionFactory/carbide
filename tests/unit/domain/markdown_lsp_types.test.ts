import { describe, it, expect } from "vitest";
import {
  markdown_lsp_capabilities,
  is_markdown_lsp_running,
  is_markdown_lsp_failed,
  markdown_lsp_error_message,
} from "$lib/features/markdown_lsp/types";

describe("markdown_lsp_capabilities", () => {
  const full_server_caps = {
    hover: true,
    completion: true,
    references: true,
    definition: true,
    code_actions: true,
    rename: true,
    formatting: true,
    inlay_hints: true,
    workspace_symbols: true,
    document_symbols: true,
  };

  const minimal_server_caps = {
    hover: true,
    completion: true,
    references: false,
    definition: false,
    code_actions: false,
    rename: false,
    formatting: false,
    inlay_hints: false,
    workspace_symbols: false,
    document_symbols: false,
  };

  it("merges server caps with iwes transform_actions", () => {
    expect(markdown_lsp_capabilities(full_server_caps, "iwes")).toEqual({
      ...full_server_caps,
      transform_actions: true,
    });
  });

  it("merges server caps with marksman (no transform_actions)", () => {
    expect(markdown_lsp_capabilities(minimal_server_caps, "marksman")).toEqual({
      ...minimal_server_caps,
      transform_actions: false,
    });
  });

  it("merges server caps with markdown_oxide (no transform_actions)", () => {
    expect(
      markdown_lsp_capabilities(full_server_caps, "markdown_oxide"),
    ).toEqual({
      ...full_server_caps,
      transform_actions: false,
    });
  });
});

describe("is_markdown_lsp_running", () => {
  it("returns true for running", () => {
    expect(is_markdown_lsp_running("running")).toBe(true);
  });

  it("returns false for starting", () => {
    expect(is_markdown_lsp_running("starting")).toBe(false);
  });

  it("returns false for stopped", () => {
    expect(is_markdown_lsp_running("stopped")).toBe(false);
  });

  it("returns false for failed object", () => {
    expect(is_markdown_lsp_running({ failed: { message: "err" } })).toBe(false);
  });

  it("returns false for restarting object", () => {
    expect(is_markdown_lsp_running({ restarting: { attempt: 1 } })).toBe(false);
  });
});

describe("is_markdown_lsp_failed", () => {
  it("returns true for failed object", () => {
    expect(is_markdown_lsp_failed({ failed: { message: "err" } })).toBe(true);
  });

  it("returns false for running", () => {
    expect(is_markdown_lsp_failed("running")).toBe(false);
  });

  it("returns false for restarting object", () => {
    expect(is_markdown_lsp_failed({ restarting: { attempt: 1 } })).toBe(false);
  });
});

describe("markdown_lsp_error_message", () => {
  it("returns message from failed object", () => {
    expect(markdown_lsp_error_message({ failed: { message: "crash" } })).toBe(
      "crash",
    );
  });

  it("returns null for running", () => {
    expect(markdown_lsp_error_message("running")).toBeNull();
  });

  it("returns null for stopped", () => {
    expect(markdown_lsp_error_message("stopped")).toBeNull();
  });
});
