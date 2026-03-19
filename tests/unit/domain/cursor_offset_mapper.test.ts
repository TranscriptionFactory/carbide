import { describe, expect, it } from "vitest";
import {
  prose_cursor_to_md_offset,
  md_offset_to_prose_pos,
} from "$lib/features/editor/adapters/cursor_offset_mapper";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";

function md_doc(markdown: string) {
  return parse_markdown(markdown);
}

function reserialized(markdown: string): string {
  return serialize_markdown(md_doc(markdown));
}

describe("prose_cursor_to_md_offset", () => {
  it("returns 0 for position 0", () => {
    const doc = md_doc("hello");
    expect(prose_cursor_to_md_offset(doc, 0, "hello")).toBe(0);
  });

  it("maps cursor at end of simple paragraph", () => {
    const md = "hello world";
    const doc = md_doc(md);
    const serialized = reserialized(md);
    const offset = prose_cursor_to_md_offset(doc, doc.content.size, serialized);
    expect(offset).toBe(serialized.trimEnd().length);
  });

  it("maps cursor in first paragraph of multi-paragraph doc", () => {
    const md = "first paragraph\n\nsecond paragraph";
    const serialized = reserialized(md);
    const doc = md_doc(md);
    // ProseMirror pos 1 = paragraph open, 2 = "f", 3 = "i", 4 = "r"
    // textBetween(0, 4) = "fir" (3 text chars)
    const offset = prose_cursor_to_md_offset(doc, 4, serialized);
    expect(serialized.substring(0, offset)).toBe("fir");
  });

  it("maps cursor to second paragraph after blank line", () => {
    const md = "first\n\nsecond";
    const serialized = reserialized(md);
    const doc = md_doc(md);
    // First paragraph: pos 0(open) 1-5("first") 6(close)
    // Second paragraph: pos 7(open) 8-13("second") 14(close)
    // textBetween(0, 10) should give "first\nsec"
    const offset = prose_cursor_to_md_offset(doc, 10, serialized);
    const md_second_start = serialized.indexOf("second");
    expect(offset).toBeGreaterThan(md_second_start);
    expect(offset).toBeLessThanOrEqual(md_second_start + 3);
  });

  it("maps cursor in heading (skips # prefix)", () => {
    const md = "# Hello World";
    const serialized = reserialized(md);
    const doc = md_doc(md);
    // Heading: pos 0(open) 1("H") 2("e") 3("l")
    // textBetween(0, 3) = "He"
    const offset = prose_cursor_to_md_offset(doc, 3, serialized);
    expect(serialized.substring(0, offset)).toContain("He");
  });

  it("maps cursor in h2 heading", () => {
    const md = "## Subheading";
    const serialized = reserialized(md);
    const doc = md_doc(md);
    // Heading pos 0(open), 1("S"), 2("u"), 3("b"), 4("h")
    // textBetween(0, 4) = "Sub"
    const offset = prose_cursor_to_md_offset(doc, 4, serialized);
    expect(serialized.substring(0, offset)).toContain("Sub");
  });

  it("maps cursor past frontmatter into body content", () => {
    const md = "---\ntitle: Test\n---\n\nContent here";
    const serialized = reserialized(md);
    const doc = md_doc(md);
    const md_content_start = serialized.indexOf("Content");
    // Find the "Content" block in the doc
    const text = doc.textBetween(0, doc.content.size, "\n");
    const content_text_idx = text.indexOf("Content");
    if (content_text_idx >= 0 && md_content_start >= 0) {
      // Position in prose: the node open token adds +1 per block boundary
      // Just verify the offset lands in the right area
      const pos = content_text_idx + 4; // +4 for a few chars into "Content"
      const offset = prose_cursor_to_md_offset(doc, pos, serialized);
      expect(offset).toBeGreaterThan(md_content_start);
    }
  });

  it("maps cursor inside a list item", () => {
    const md = "- first item\n- second item";
    const serialized = reserialized(md);
    const doc = md_doc(md);
    // bullet_list > list_item > paragraph > text("first item")
    // pos 0: bullet_list open
    // pos 1: list_item open
    // pos 2: paragraph open
    // pos 3: "f", 4: "i", 5: "r", ...
    // Use a position well inside the first item's text
    const offset = prose_cursor_to_md_offset(doc, 5, serialized);
    const md_first = serialized.indexOf("first");
    expect(offset).toBeGreaterThanOrEqual(md_first);
    expect(offset).toBeLessThanOrEqual(md_first + 10);
  });

  it("maps cursor inside a blockquote", () => {
    const md = "> quoted text";
    const serialized = reserialized(md);
    const doc = md_doc(md);
    // blockquote > paragraph > text("quoted text")
    // pos 0: blockquote open, 1: paragraph open, 2: "q", 3: "u"
    // textBetween(0, 4) = "qu"
    const offset = prose_cursor_to_md_offset(doc, 4, serialized);
    const md_q = serialized.indexOf("quoted");
    expect(offset).toBeGreaterThanOrEqual(md_q);
    expect(offset).toBeLessThanOrEqual(md_q + 5);
  });

  it("handles empty document", () => {
    const md = "";
    const doc = md_doc(md);
    expect(prose_cursor_to_md_offset(doc, 0, "")).toBe(0);
  });

  it("handles code block content", () => {
    const md = "```js\nconst x = 1;\n```";
    const serialized = reserialized(md);
    const doc = md_doc(md);
    const text = doc.textBetween(0, doc.content.size, "\n");
    const const_idx = text.indexOf("const");
    if (const_idx >= 0) {
      const offset = prose_cursor_to_md_offset(doc, const_idx + 3, serialized);
      const md_const = serialized.indexOf("const");
      expect(offset).toBeGreaterThanOrEqual(md_const);
      expect(offset).toBeLessThanOrEqual(md_const + 10);
    }
  });
});

describe("md_offset_to_prose_pos", () => {
  it("returns 0 for offset 0", () => {
    const doc = md_doc("hello");
    expect(md_offset_to_prose_pos(doc, 0, "hello")).toBe(0);
  });

  it("returns content.size for offset at end", () => {
    const md = "hello";
    const serialized = reserialized(md);
    const doc = md_doc(md);
    const pos = md_offset_to_prose_pos(doc, serialized.length, serialized);
    expect(pos).toBe(doc.content.size);
  });

  it("round-trips simple paragraph cursor (starting from text positions)", () => {
    const md = "hello world";
    const serialized = reserialized(md);
    const doc = md_doc(md);
    // Start from position 2+ to avoid the ambiguity at node boundaries
    // Position 1 = paragraph open (textBetween gives ""), position 2 = after "h"
    for (let prose_pos = 2; prose_pos <= 6; prose_pos++) {
      const md_off = prose_cursor_to_md_offset(doc, prose_pos, serialized);
      const back = md_offset_to_prose_pos(doc, md_off, serialized);
      expect(back).toBe(prose_pos);
    }
  });

  it("round-trips heading cursor", () => {
    const md = "# Title";
    const serialized = reserialized(md);
    const doc = md_doc(md);
    // Position 2 = "T", 3 = "i", etc. (pos 0 = heading open, 1 = heading open)
    // Actually heading is a single node, so pos 0 = open, 1 = first char
    const md_off = prose_cursor_to_md_offset(doc, 3, serialized);
    const back = md_offset_to_prose_pos(doc, md_off, serialized);
    expect(back).toBe(3);
  });

  it("round-trips multi-paragraph cursor approximately", () => {
    const md = "first\n\nsecond";
    const serialized = reserialized(md);
    const doc = md_doc(md);
    // Position 10: inside "second" paragraph
    const md_off = prose_cursor_to_md_offset(doc, 10, serialized);
    const back = md_offset_to_prose_pos(doc, md_off, serialized);
    expect(Math.abs(back - 10)).toBeLessThanOrEqual(2);
  });
});
