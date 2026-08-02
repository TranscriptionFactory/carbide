import { describe, expect, it } from "vitest";
import {
  context_window,
  extract_line_range,
} from "$lib/features/assistant/domain/context_window";

describe("context_window", () => {
  it("spans the selection plus the radius on both sides", () => {
    expect(context_window(500, 600, 10_000, 100)).toEqual({
      start: 400,
      end: 700,
    });
  });

  it("looks backwards only from a bare cursor", () => {
    expect(context_window(500, null, 10_000, 100)).toEqual({
      start: 400,
      end: 500,
    });
  });

  it("clamps a selection window to the document bounds", () => {
    expect(context_window(50, 9_950, 10_000, 100)).toEqual({
      start: 0,
      end: 10_000,
    });
  });

  it("clamps a cursor past the end of the document to its length", () => {
    expect(context_window(99_999, null, 1_000, 100)).toEqual({
      start: 900,
      end: 1_000,
    });
  });

  it("clamps a negative cursor to the start of the document", () => {
    expect(context_window(-40, null, 1_000, 100)).toEqual({
      start: 0,
      end: 0,
    });
  });
});

describe("extract_line_range", () => {
  const markdown = ["# Title", "intro", "## Body", "answer here", "tail"].join(
    "\n",
  );

  it("slices the inclusive line range of the enclosing section", () => {
    expect(extract_line_range(markdown, 2, 3)).toBe("## Body\nanswer here");
  });

  it("clamps an end line past the document to the last line", () => {
    expect(extract_line_range(markdown, 4, 99)).toBe("tail");
  });

  it("returns empty when the start line is beyond the document", () => {
    expect(extract_line_range(markdown, 50, 60)).toBe("");
  });

  it("returns a single line when start equals end", () => {
    expect(extract_line_range(markdown, 0, 0)).toBe("# Title");
  });
});
