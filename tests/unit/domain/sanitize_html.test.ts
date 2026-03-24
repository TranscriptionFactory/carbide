// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sanitize_html, get_default_allowlist } from "$lib/shared/html";

describe("sanitize_html", () => {
  describe("allowed elements pass through", () => {
    it("preserves basic formatting tags", () => {
      const html = "<p>Hello <strong>world</strong> and <em>universe</em></p>";
      expect(sanitize_html(html)).toBe(html);
    });

    it("preserves headings", () => {
      const html = "<h1>Title</h1><h2>Subtitle</h2>";
      expect(sanitize_html(html)).toBe(html);
    });

    it("preserves lists", () => {
      const html = "<ul><li>one</li><li>two</li></ul>";
      expect(sanitize_html(html)).toBe(html);
    });

    it("preserves tables", () => {
      const html =
        "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>";
      expect(sanitize_html(html)).toBe(html);
    });

    it("preserves links with allowed attributes", () => {
      const html = '<a href="https://example.com" title="Example">link</a>';
      expect(sanitize_html(html)).toBe(html);
    });

    it("preserves images with allowed attributes", () => {
      const html = '<img src="photo.png" alt="Photo" width="100">';
      expect(sanitize_html(html)).toBe(html);
    });
  });

  describe("disallowed elements are stripped", () => {
    it("removes script tags and their content", () => {
      const html = '<p>safe</p><script>alert("xss")</script>';
      expect(sanitize_html(html)).toBe("<p>safe</p>");
    });

    it("strips disallowed tags but preserves children by default", () => {
      const html = "<article><p>content</p></article>";
      expect(sanitize_html(html)).toBe("<p>content</p>");
    });

    it("removes iframe elements", () => {
      const html = '<iframe src="evil.html"></iframe><p>ok</p>';
      expect(sanitize_html(html)).toBe("<p>ok</p>");
    });

    it("removes form elements", () => {
      const html = "<form><input><p>text</p></form>";
      expect(sanitize_html(html)).toBe("<p>text</p>");
    });
  });

  describe("disallowed attributes are removed", () => {
    it("strips onclick handlers", () => {
      const result = sanitize_html('<p onclick="alert(1)">text</p>');
      expect(result).toBe("<p>text</p>");
    });

    it("strips onerror on img", () => {
      const result = sanitize_html(
        '<img src="x" onerror="alert(1)" alt="test">',
      );
      expect(result).toBe('<img src="x" alt="test">');
    });

    it("preserves global attributes (id, class, style, title, dir, lang)", () => {
      const html =
        '<div id="main" class="container" style="color:red" title="tip" dir="ltr" lang="en">ok</div>';
      expect(sanitize_html(html)).toBe(html);
    });
  });

  describe("javascript: URL sanitization", () => {
    it("removes javascript: href from links", () => {
      const result = sanitize_html('<a href="javascript:alert(1)">click</a>');
      expect(result).toBe("<a>click</a>");
    });

    it("removes javascript: with whitespace padding", () => {
      const result = sanitize_html('<a href="  javascript:void(0)">click</a>');
      expect(result).toBe("<a>click</a>");
    });

    it("preserves normal hrefs", () => {
      const html = '<a href="https://safe.com">link</a>';
      expect(sanitize_html(html)).toBe(html);
    });
  });

  describe("HTML comments are removed", () => {
    it("strips comments", () => {
      const result = sanitize_html("<p>before</p><!-- comment --><p>after</p>");
      expect(result).toBe("<p>before</p><p>after</p>");
    });
  });

  describe("strip_disallowed option", () => {
    it("removes children when strip_disallowed is false", () => {
      const result = sanitize_html("<nav><p>ok</p></nav>", {
        strip_disallowed: false,
      });
      expect(result).not.toContain("nav");
      expect(result).not.toContain("ok");
    });
  });

  describe("get_default_allowlist returns independent copy", () => {
    it("mutations do not affect future calls", () => {
      const a = get_default_allowlist();
      a.delete("p");
      const b = get_default_allowlist();
      expect(b.has("p")).toBe(true);
    });
  });

  describe("empty and minimal inputs", () => {
    it("returns empty string for empty input", () => {
      expect(sanitize_html("")).toBe("");
    });

    it("preserves plain text", () => {
      expect(sanitize_html("just text")).toBe("just text");
    });
  });
});
