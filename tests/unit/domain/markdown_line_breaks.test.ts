import { describe, expect, it } from "vitest";
import {
  MARKDOWN_HARD_BREAK,
  insert_markdown_hard_break,
  normalize_markdown_line_breaks,
} from "$lib/features/editor/domain/markdown_line_breaks";

describe("normalize_markdown_line_breaks", () => {
  it("normalizes html hard breaks to backslash line breaks", () => {
    expect(normalize_markdown_line_breaks("one<br />\ntwo")).toBe("one\\\ntwo");
  });

  it("normalizes trailing-space hard breaks to backslash line breaks", () => {
    expect(normalize_markdown_line_breaks("one  \ntwo")).toBe("one\\\ntwo");
  });

  it("preserves canonical backslash hard breaks", () => {
    expect(normalize_markdown_line_breaks("one\\\ntwo")).toBe("one\\\ntwo");
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

  it("strips stray backslash on an otherwise empty line", () => {
    expect(normalize_markdown_line_breaks("one\n\\\ntwo")).toBe("one\n\ntwo");
  });

  it("strips stray backslash with surrounding whitespace on an otherwise empty line", () => {
    expect(normalize_markdown_line_breaks("one\n  \\  \ntwo")).toBe(
      "one\n\ntwo",
    );
  });

  it("preserves valid hard break with text before backslash", () => {
    expect(normalize_markdown_line_breaks("one\\\ntwo")).toBe("one\\\ntwo");
  });

  it("strips zero-width spaces while normalizing", () => {
    expect(normalize_markdown_line_breaks("one\u200B<br />\ntwo")).toBe(
      "one\\\ntwo",
    );
  });

  it("strips trailing backslash from bullet list item with no content", () => {
    expect(normalize_markdown_line_breaks("- \\\ntwo")).toBe("- \ntwo");
  });

  it("strips trailing backslash from task list item with no content", () => {
    expect(normalize_markdown_line_breaks("- [ ] \\\ntwo")).toBe("- [ ] \ntwo");
  });

  it("strips trailing backslash from checked task list item with no content", () => {
    expect(normalize_markdown_line_breaks("* [x] \\\ntwo")).toBe("* [x] \ntwo");
  });

  it("strips trailing backslash from ordered list item with no content", () => {
    expect(normalize_markdown_line_breaks("1. \\\ntwo")).toBe("1. \ntwo");
  });

  it("strips trailing backslash from heading with no content", () => {
    expect(normalize_markdown_line_breaks("# \\\ntwo")).toBe("# \ntwo");
  });

  it("strips trailing backslash from h3 with no content", () => {
    expect(normalize_markdown_line_breaks("### \\\ntwo")).toBe("### \ntwo");
  });

  it("strips trailing backslash from blockquote with no content", () => {
    expect(normalize_markdown_line_breaks("> \\\ntwo")).toBe("> \ntwo");
  });

  it("preserves trailing backslash in heading with text content", () => {
    expect(normalize_markdown_line_breaks("# hello\\\ntwo")).toBe(
      "# hello\\\ntwo",
    );
  });

  it("preserves trailing backslash in blockquote with text content", () => {
    expect(normalize_markdown_line_breaks("> hello\\\ntwo")).toBe(
      "> hello\\\ntwo",
    );
  });

  it("preserves trailing backslash in list item with text content", () => {
    expect(normalize_markdown_line_breaks("- hello\\\ntwo")).toBe(
      "- hello\\\ntwo",
    );
  });

  it("preserves trailing backslash in task list item with text content", () => {
    expect(normalize_markdown_line_breaks("- [ ] hello\\\ntwo")).toBe(
      "- [ ] hello\\\ntwo",
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
      cursor_offset: 5,
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
      cursor_offset: 5,
    });
  });
});

describe("normalize_markdown_line_breaks — math blocks", () => {
  it("preserves content inside math blocks without normalization", () => {
    const markdown = ["$$", "x<br />", "$$"].join("\n");
    expect(normalize_markdown_line_breaks(markdown)).toBe(markdown);
  });

  it("normalizes content outside math blocks normally", () => {
    const markdown = ["$$", "x<br />", "$$", "one  "].join("\n");
    const expected = ["$$", "x<br />", "$$", "one\\"].join("\n");
    expect(normalize_markdown_line_breaks(markdown)).toBe(expected);
  });
});
