import { describe, expect, it } from "vitest";
import {
  MARKDOWN_HARD_BREAK,
  insert_markdown_hard_break,
  normalize_markdown_line_breaks,
  prepare_markdown_line_breaks_for_visual_editor,
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

  it("strips zero-width spaces while normalizing", () => {
    expect(normalize_markdown_line_breaks("one\u200B<br />\ntwo")).toBe(
      "one\\\ntwo",
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

describe("prepare_markdown_line_breaks_for_visual_editor", () => {
  it("converts canonical backslash hard breaks to html breaks for visual parsing", () => {
    expect(prepare_markdown_line_breaks_for_visual_editor("one\\\ntwo")).toBe(
      "one<br />\ntwo",
    );
  });

  it("normalizes legacy hard breaks before preparing for the visual editor", () => {
    expect(prepare_markdown_line_breaks_for_visual_editor("one  \ntwo")).toBe(
      "one<br />\ntwo",
    );
  });

  it("preserves lines ending with multiple backslashes", () => {
    expect(prepare_markdown_line_breaks_for_visual_editor("one\\\\\ntwo")).toBe(
      "one\\\\\ntwo",
    );
  });

  it("preserves hard-break syntax inside inline code spans", () => {
    expect(
      prepare_markdown_line_breaks_for_visual_editor("`one\\`\\\ntwo"),
    ).toBe("`one\\`<br />\ntwo");
    expect(prepare_markdown_line_breaks_for_visual_editor("`one\\`")).toBe(
      "`one\\`",
    );
  });

  it("preserves hard-break syntax inside fenced code blocks", () => {
    const markdown = ["```md", "one\\", "```"].join("\n");
    expect(prepare_markdown_line_breaks_for_visual_editor(markdown)).toBe(
      markdown,
    );
  });

  it("preserves backslashes inside math blocks", () => {
    const markdown = ["$$", "x = \\frac{1}{2}\\", "$$"].join("\n");
    expect(prepare_markdown_line_breaks_for_visual_editor(markdown)).toBe(
      markdown,
    );
  });

  it("preserves LaTeX line breaks (double backslash) inside math blocks", () => {
    const markdown = [
      "$$",
      "\\begin{aligned}",
      "  x &= y \\\\",
      "  a &= b",
      "\\end{aligned}",
      "$$",
    ].join("\n");
    expect(prepare_markdown_line_breaks_for_visual_editor(markdown)).toBe(
      markdown,
    );
  });

  it("resumes normal processing after math block closes", () => {
    const markdown = ["$$", "x\\", "$$", "after\\"].join("\n");
    const expected = ["$$", "x\\", "$$", "after<br />"].join("\n");
    expect(prepare_markdown_line_breaks_for_visual_editor(markdown)).toBe(
      expected,
    );
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
