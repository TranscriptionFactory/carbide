import { describe, expect, it } from "vitest";
import {
  MARKDOWN_HARD_BREAK,
  insert_markdown_hard_break,
  normalize_markdown_line_breaks,
} from "$lib/features/editor/domain/markdown_line_breaks";

describe("normalize_markdown_line_breaks", () => {
  it("normalizes html hard breaks to canonical html line breaks", () => {
    expect(normalize_markdown_line_breaks("one<br />\ntwo")).toBe(
      "one<br />\ntwo",
    );
  });

  it("normalizes trailing-space hard breaks to canonical html line breaks", () => {
    expect(normalize_markdown_line_breaks("one  \ntwo")).toBe("one<br />\ntwo");
  });

  it("normalizes backslash hard breaks to canonical html line breaks", () => {
    expect(normalize_markdown_line_breaks("one\\\ntwo")).toBe("one<br />\ntwo");
  });

  it("preserves lines ending with multiple backslashes", () => {
    expect(normalize_markdown_line_breaks("one\\\\\ntwo")).toBe("one\\\\\ntwo");
  });

  it("preserves soft breaks", () => {
    expect(normalize_markdown_line_breaks("one\ntwo")).toBe("one\ntwo");
  });

  it("preserves html break text inside fenced code blocks", () => {
    const markdown = ["```html", "one<br />", "```"].join("\n");
    expect(normalize_markdown_line_breaks(markdown)).toBe(markdown);
  });

  it("preserves html break text inside inline code spans", () => {
    expect(normalize_markdown_line_breaks("`one<br />`")).toBe("`one<br />`");
  });

  it("strips zero-width spaces while normalizing", () => {
    expect(normalize_markdown_line_breaks("one\u200B<br />\ntwo")).toBe(
      "one<br />\ntwo",
    );
  });
});

describe("insert_markdown_hard_break", () => {
  it("inserts a hard break at the cursor", () => {
    expect(
      insert_markdown_hard_break({
        markdown: "one",
        start: 3,
        end: 3,
      }),
    ).toEqual({
      markdown: `one${MARKDOWN_HARD_BREAK}`,
      cursor_offset: 10,
    });
  });

  it("replaces the selected range with a hard break", () => {
    expect(
      insert_markdown_hard_break({
        markdown: "one two",
        start: 3,
        end: 7,
      }),
    ).toEqual({
      markdown: `one${MARKDOWN_HARD_BREAK}`,
      cursor_offset: 10,
    });
  });
});
