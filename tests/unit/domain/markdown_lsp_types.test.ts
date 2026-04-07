import { describe, it, expect } from "vitest";
import {
  markdown_lsp_capabilities,
  is_markdown_lsp_running,
  is_markdown_lsp_failed,
  markdown_lsp_error_message,
} from "$lib/features/markdown_lsp/types";

describe("markdown_lsp_capabilities", () => {
  it("returns full capabilities for iwes", () => {
    expect(markdown_lsp_capabilities("iwes")).toEqual({
      inlay_hints: true,
      formatting: true,
      transform_actions: true,
    });
  });

  it("returns no capabilities for marksman", () => {
    expect(markdown_lsp_capabilities("marksman")).toEqual({
      inlay_hints: false,
      formatting: false,
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
