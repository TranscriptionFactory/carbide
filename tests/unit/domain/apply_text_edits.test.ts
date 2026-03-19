import { describe, it, expect } from "vitest";
import { apply_lint_text_edits } from "$lib/features/lint/domain/apply_text_edits";
import type { LintTextEdit } from "$lib/features/lint/types/lint";

describe("apply_lint_text_edits", () => {
  it("returns original markdown when edits are empty", () => {
    const markdown = "# Hello\n\nWorld";
    expect(apply_lint_text_edits(markdown, [])).toBe(markdown);
  });

  it("applies a single replacement edit", () => {
    const markdown = "# Hello\n\nWorld";
    const edits: LintTextEdit[] = [
      {
        start_line: 1,
        start_column: 3,
        end_line: 1,
        end_column: 8,
        new_text: "Goodbye",
      },
    ];
    expect(apply_lint_text_edits(markdown, edits)).toBe("# Goodbye\n\nWorld");
  });

  it("applies an insertion edit", () => {
    const markdown = "# Hello\n\nWorld";
    const edits: LintTextEdit[] = [
      {
        start_line: 3,
        start_column: 6,
        end_line: 3,
        end_column: 6,
        new_text: "!",
      },
    ];
    expect(apply_lint_text_edits(markdown, edits)).toBe("# Hello\n\nWorld!");
  });

  it("applies a deletion edit", () => {
    const markdown = "# Hello World\n\nContent";
    const edits: LintTextEdit[] = [
      {
        start_line: 1,
        start_column: 8,
        end_line: 1,
        end_column: 14,
        new_text: "",
      },
    ];
    expect(apply_lint_text_edits(markdown, edits)).toBe("# Hello\n\nContent");
  });

  it("applies multiple edits in correct order (bottom-up)", () => {
    const markdown = "line1\nline2\nline3";
    const edits: LintTextEdit[] = [
      {
        start_line: 1,
        start_column: 1,
        end_line: 1,
        end_column: 6,
        new_text: "LINE1",
      },
      {
        start_line: 3,
        start_column: 1,
        end_line: 3,
        end_column: 6,
        new_text: "LINE3",
      },
    ];
    expect(apply_lint_text_edits(markdown, edits)).toBe("LINE1\nline2\nLINE3");
  });

  it("handles multi-line edits", () => {
    const markdown = "# Title\n\nParagraph one.\nParagraph two.";
    const edits: LintTextEdit[] = [
      {
        start_line: 3,
        start_column: 1,
        end_line: 4,
        end_column: 15,
        new_text: "Single paragraph.",
      },
    ];
    expect(apply_lint_text_edits(markdown, edits)).toBe(
      "# Title\n\nSingle paragraph.",
    );
  });

  it("skips edits with out-of-range lines", () => {
    const markdown = "line1";
    const edits: LintTextEdit[] = [
      {
        start_line: 5,
        start_column: 1,
        end_line: 5,
        end_column: 3,
        new_text: "x",
      },
    ];
    expect(apply_lint_text_edits(markdown, edits)).toBe("line1");
  });

  it("handles edit at end of file", () => {
    const markdown = "hello";
    const edits: LintTextEdit[] = [
      {
        start_line: 1,
        start_column: 6,
        end_line: 1,
        end_column: 6,
        new_text: " world",
      },
    ];
    expect(apply_lint_text_edits(markdown, edits)).toBe("hello world");
  });
});
