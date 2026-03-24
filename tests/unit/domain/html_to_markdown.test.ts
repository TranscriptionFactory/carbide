// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html_to_markdown } from "$lib/shared/html";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false }).enable(["table", "strikethrough"]);

describe("html_to_markdown", () => {
  describe("headings", () => {
    it("converts h1", () => {
      expect(html_to_markdown("<h1>Title</h1>")).toBe("# Title");
    });

    it("converts h2", () => {
      expect(html_to_markdown("<h2>Section</h2>")).toBe("## Section");
    });

    it("converts h3 through h6", () => {
      expect(html_to_markdown("<h3>A</h3>")).toBe("### A");
      expect(html_to_markdown("<h4>B</h4>")).toBe("#### B");
      expect(html_to_markdown("<h5>C</h5>")).toBe("##### C");
      expect(html_to_markdown("<h6>D</h6>")).toBe("###### D");
    });
  });

  describe("inline formatting", () => {
    it("converts bold", () => {
      expect(html_to_markdown("<p><strong>bold</strong></p>")).toBe("**bold**");
    });

    it("converts italic", () => {
      expect(html_to_markdown("<p><em>italic</em></p>")).toBe("*italic*");
    });

    it("converts strikethrough", () => {
      const result = html_to_markdown("<p><del>strike</del></p>");
      expect(result).toMatch(/~+strike~+/);
    });

    it("converts inline code", () => {
      expect(html_to_markdown("<p><code>x = 1</code></p>")).toBe("`x = 1`");
    });
  });

  describe("links and images", () => {
    it("converts links", () => {
      expect(
        html_to_markdown('<a href="https://example.com">Example</a>'),
      ).toBe("[Example](https://example.com)");
    });

    it("converts links with title", () => {
      const result = html_to_markdown(
        '<a href="https://example.com" title="A site">Link</a>',
      );
      expect(result).toBe('[Link](https://example.com "A site")');
    });

    it("converts images", () => {
      expect(html_to_markdown('<img src="photo.png" alt="A photo">')).toBe(
        "![A photo](photo.png)",
      );
    });
  });

  describe("lists", () => {
    it("converts unordered list", () => {
      const result = html_to_markdown(
        "<ul><li>one</li><li>two</li><li>three</li></ul>",
      );
      expect(result).toContain("one");
      expect(result).toContain("two");
      expect(result).toContain("three");
      expect(result).toMatch(/^-\s+one/m);
    });

    it("converts ordered list", () => {
      const result = html_to_markdown("<ol><li>first</li><li>second</li></ol>");
      expect(result).toMatch(/^1\.\s+first/m);
      expect(result).toMatch(/^2\.\s+second/m);
    });

    it("converts nested unordered lists", () => {
      const result = html_to_markdown(
        "<ul><li>parent<ul><li>child</li></ul></li></ul>",
      );
      expect(result).toContain("parent");
      expect(result).toContain("child");
    });
  });

  describe("code blocks", () => {
    it("converts fenced code block with language", () => {
      const result = html_to_markdown(
        '<pre><code class="language-python">print("hello")</code></pre>',
      );
      expect(result).toBe('```python\nprint("hello")\n```');
    });

    it("converts fenced code block without language", () => {
      const result = html_to_markdown("<pre><code>plain code</code></pre>");
      expect(result).toBe("```\nplain code\n```");
    });
  });

  describe("blockquotes", () => {
    it("converts blockquote", () => {
      const result = html_to_markdown("<blockquote><p>quoted</p></blockquote>");
      expect(result).toBe("> quoted");
    });
  });

  describe("tables", () => {
    it("converts a basic table", () => {
      const html = `<table>
        <thead><tr><th>Name</th><th>Age</th></tr></thead>
        <tbody><tr><td>Alice</td><td>30</td></tr></tbody>
      </table>`;
      const result = html_to_markdown(html);
      expect(result).toContain("| Name | Age |");
      expect(result).toContain("| --- | --- |");
      expect(result).toContain("| Alice | 30 |");
    });
  });

  describe("sanitization integration", () => {
    it("strips script tags before conversion", () => {
      const result = html_to_markdown(
        '<p>safe</p><script>alert("xss")</script>',
      );
      expect(result).not.toContain("script");
      expect(result).not.toContain("alert");
      expect(result).toBe("safe");
    });

    it("strips javascript: href before conversion", () => {
      const result = html_to_markdown(
        '<a href="javascript:alert(1)">click</a>',
      );
      expect(result).not.toContain("javascript:");
    });

    it("removes style tags", () => {
      const result = html_to_markdown(
        "<style>body{color:red}</style><p>text</p>",
      );
      expect(result).not.toContain("color");
      expect(result).toBe("text");
    });
  });

  describe("edge cases", () => {
    it("returns empty string for empty input", () => {
      expect(html_to_markdown("")).toBe("");
    });

    it("returns empty string for whitespace-only input", () => {
      expect(html_to_markdown("   ").trim()).toBe("");
    });

    it("handles nested bold and italic", () => {
      const result = html_to_markdown("<p><strong><em>both</em></strong></p>");
      expect(result).toContain("both");
      expect(result).toMatch(/\*+both\*+/);
    });

    it("handles paragraph with plain text", () => {
      expect(html_to_markdown("<p>Hello world</p>")).toBe("Hello world");
    });

    it("handles multiple paragraphs", () => {
      const result = html_to_markdown("<p>First</p><p>Second</p>");
      expect(result).toContain("First");
      expect(result).toContain("Second");
    });
  });

  describe("roundtrip", () => {
    it("markdown → html → markdown preserves headings", () => {
      const original = "# Heading One";
      const rendered_html = md.render(original);
      const back = html_to_markdown(rendered_html);
      expect(back.trim()).toBe("# Heading One");
    });

    it("markdown → html → markdown preserves bold text", () => {
      const original = "This is **bold** text.";
      const rendered_html = md.render(original);
      const back = html_to_markdown(rendered_html);
      expect(back).toContain("**bold**");
    });

    it("markdown → html → markdown preserves links", () => {
      const original = "[Example](https://example.com)";
      const rendered_html = md.render(original);
      const back = html_to_markdown(rendered_html);
      expect(back).toContain("[Example](https://example.com)");
    });

    it("markdown → html → markdown preserves unordered list", () => {
      const original = "- alpha\n- beta\n- gamma";
      const rendered_html = md.render(original);
      const back = html_to_markdown(rendered_html);
      expect(back).toContain("alpha");
      expect(back).toContain("beta");
      expect(back).toContain("gamma");
    });

    it("markdown → html → markdown preserves code block", () => {
      const original = "```js\nconsole.log(1);\n```";
      const rendered_html = md.render(original);
      const back = html_to_markdown(rendered_html);
      expect(back).toContain("console.log(1);");
    });
  });
});
