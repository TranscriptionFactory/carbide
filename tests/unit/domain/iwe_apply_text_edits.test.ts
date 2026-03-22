import { describe, it, expect } from "vitest";
import { apply_text_edits } from "$lib/features/iwe/domain/apply_text_edits";
import type { IweTextEdit } from "$lib/features/iwe/types";

describe("apply_text_edits (IWE, 0-indexed)", () => {
  it("returns original markdown when edits are empty", () => {
    const markdown = "# Hello\n\nWorld";
    expect(apply_text_edits(markdown, [])).toBe(markdown);
  });

  it("applies a single replacement edit", () => {
    const markdown = "# Hello\n\nWorld";
    const edits: IweTextEdit[] = [
      {
        range: {
          start_line: 0,
          start_character: 2,
          end_line: 0,
          end_character: 7,
        },
        new_text: "Goodbye",
      },
    ];
    expect(apply_text_edits(markdown, edits)).toBe("# Goodbye\n\nWorld");
  });

  it("applies a single insertion edit", () => {
    const markdown = "# Hello\n\nWorld";
    const edits: IweTextEdit[] = [
      {
        range: {
          start_line: 2,
          start_character: 5,
          end_line: 2,
          end_character: 5,
        },
        new_text: "!",
      },
    ];
    expect(apply_text_edits(markdown, edits)).toBe("# Hello\n\nWorld!");
  });

  it("applies a deletion edit", () => {
    const markdown = "# Hello\n\nWorld";
    const edits: IweTextEdit[] = [
      {
        range: {
          start_line: 1,
          start_character: 0,
          end_line: 2,
          end_character: 0,
        },
        new_text: "",
      },
    ];
    expect(apply_text_edits(markdown, edits)).toBe("# Hello\nWorld");
  });

  it("applies multiple non-overlapping edits in correct order", () => {
    const markdown = "line one\nline two\nline three";
    const edits: IweTextEdit[] = [
      {
        range: {
          start_line: 0,
          start_character: 5,
          end_line: 0,
          end_character: 8,
        },
        new_text: "1",
      },
      {
        range: {
          start_line: 2,
          start_character: 5,
          end_line: 2,
          end_character: 10,
        },
        new_text: "3",
      },
    ];
    expect(apply_text_edits(markdown, edits)).toBe("line 1\nline two\nline 3");
  });

  it("handles multi-line replacement", () => {
    const markdown = "# Title\n\nFirst paragraph.\n\nSecond paragraph.";
    const edits: IweTextEdit[] = [
      {
        range: {
          start_line: 2,
          start_character: 0,
          end_line: 4,
          end_character: 17,
        },
        new_text: "Combined paragraph.",
      },
    ];
    expect(apply_text_edits(markdown, edits)).toBe(
      "# Title\n\nCombined paragraph.",
    );
  });

  it("handles edit at the start of the document", () => {
    const markdown = "Hello World";
    const edits: IweTextEdit[] = [
      {
        range: {
          start_line: 0,
          start_character: 0,
          end_line: 0,
          end_character: 5,
        },
        new_text: "Hi",
      },
    ];
    expect(apply_text_edits(markdown, edits)).toBe("Hi World");
  });

  it("handles edit at the end of the document", () => {
    const markdown = "Hello";
    const edits: IweTextEdit[] = [
      {
        range: {
          start_line: 0,
          start_character: 5,
          end_line: 0,
          end_character: 5,
        },
        new_text: " World",
      },
    ];
    expect(apply_text_edits(markdown, edits)).toBe("Hello World");
  });
});
