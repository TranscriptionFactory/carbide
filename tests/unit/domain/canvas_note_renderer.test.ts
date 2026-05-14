import { describe, it, expect } from "vitest";
import {
  render_markdown_to_html,
  extract_subpath_section,
  truncate_for_canvas,
} from "$lib/features/canvas/domain/canvas_note_renderer";

describe("render_markdown_to_html", () => {
  it("renders basic markdown", () => {
    const html = render_markdown_to_html("# Hello\n\nWorld");
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<p>World</p>");
  });

  it("renders GFM tables", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const html = render_markdown_to_html(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
  });

  it("renders task lists", () => {
    const md = "- [x] done\n- [ ] todo";
    const html = render_markdown_to_html(md);
    expect(html).toContain("checked");
    expect(html).toContain('type="checkbox"');
  });

  it("strips script tags via sanitization", () => {
    const md = "<script>alert('xss')</script>\n\nSafe text";
    const html = render_markdown_to_html(md);
    expect(html).not.toContain("<script");
    expect(html).toContain("Safe text");
  });

  it("strips img tags", () => {
    const md = "![alt](image.png)\n\nText";
    const html = render_markdown_to_html(md);
    expect(html).not.toContain("<img");
  });

  it("preserves links", () => {
    const md = "[link](https://example.com)";
    const html = render_markdown_to_html(md);
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("link");
  });

  it("renders code blocks", () => {
    const md = "```js\nconst x = 1;\n```";
    const html = render_markdown_to_html(md);
    expect(html).toContain("<pre>");
    expect(html).toContain("<code");
    expect(html).toContain("const x = 1;");
  });

  it("renders bold and italic", () => {
    const md = "**bold** and *italic*";
    const html = render_markdown_to_html(md);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });
});

describe("extract_subpath_section", () => {
  const md = [
    "# Introduction",
    "",
    "Intro content.",
    "",
    "## Details",
    "",
    "Detail content.",
    "",
    "## Conclusion",
    "",
    "End content.",
  ].join("\n");

  it("extracts section by heading slug", () => {
    const section = extract_subpath_section(md, "#details");
    expect(section).toContain("## Details");
    expect(section).toContain("Detail content.");
    expect(section).not.toContain("End content.");
  });

  it("returns full markdown for non-hash subpath", () => {
    expect(extract_subpath_section(md, "")).toBe(md);
    expect(extract_subpath_section(md, "foo")).toBe(md);
  });

  it("returns full markdown when heading not found", () => {
    expect(extract_subpath_section(md, "#nonexistent")).toBe(md);
  });

  it("extracts last section to end of document", () => {
    const section = extract_subpath_section(md, "#conclusion");
    expect(section).toContain("## Conclusion");
    expect(section).toContain("End content.");
  });

  it("extracts top-level heading with all subsections", () => {
    const section = extract_subpath_section(md, "#introduction");
    expect(section).toContain("# Introduction");
    expect(section).toContain("Intro content.");
    expect(section).toContain("## Details");
    expect(section).toContain("## Conclusion");
  });

  it("handles hyphenated slugs", () => {
    const doc = "# My Great Heading\n\nContent here.";
    const section = extract_subpath_section(doc, "#my-great-heading");
    expect(section).toContain("# My Great Heading");
    expect(section).toContain("Content here.");
  });
});

describe("truncate_for_canvas", () => {
  it("returns short text unchanged", () => {
    expect(truncate_for_canvas("hello")).toBe("hello");
  });

  it("truncates at a newline boundary", () => {
    const long = "line1\nline2\nline3\nline4\n";
    const result = truncate_for_canvas(long, 16);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThan(long.length + 10);
  });

  it("respects custom max_chars", () => {
    const text = "a".repeat(100);
    const result = truncate_for_canvas(text, 50);
    expect(result.length).toBeLessThanOrEqual(55);
  });
});
