// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parse_html_metadata } from "$lib/shared/html";

describe("parse_html_metadata", () => {
  describe("title extraction", () => {
    it("extracts title from <title> tag", () => {
      const result = parse_html_metadata(
        "<html><head><title>My Page</title></head><body></body></html>",
      );
      expect(result.title).toBe("My Page");
    });

    it("falls back to first h1 when no title tag", () => {
      const result = parse_html_metadata("<h1>Heading One</h1><p>text</p>");
      expect(result.title).toBe("Heading One");
    });

    it("returns null when no title or h1", () => {
      const result = parse_html_metadata("<p>just a paragraph</p>");
      expect(result.title).toBeNull();
    });

    it("prefers title tag over h1", () => {
      const result = parse_html_metadata(
        "<html><head><title>From Title</title></head><body><h1>From H1</h1></body></html>",
      );
      expect(result.title).toBe("From Title");
    });

    it("ignores empty title tag and falls back to h1", () => {
      const result = parse_html_metadata(
        "<html><head><title>  </title></head><body><h1>Fallback</h1></body></html>",
      );
      expect(result.title).toBe("Fallback");
    });
  });

  describe("heading extraction", () => {
    it("extracts all heading levels", () => {
      const html =
        "<h1>One</h1><h2>Two</h2><h3>Three</h3><h4>Four</h4><h5>Five</h5><h6>Six</h6>";
      const result = parse_html_metadata(html);
      expect(result.headings).toEqual([
        { level: 1, text: "One" },
        { level: 2, text: "Two" },
        { level: 3, text: "Three" },
        { level: 4, text: "Four" },
        { level: 5, text: "Five" },
        { level: 6, text: "Six" },
      ]);
    });

    it("skips empty headings", () => {
      const result = parse_html_metadata("<h1></h1><h2>Real</h2>");
      expect(result.headings).toEqual([{ level: 2, text: "Real" }]);
    });

    it("returns empty array when no headings", () => {
      const result = parse_html_metadata("<p>no headings</p>");
      expect(result.headings).toEqual([]);
    });
  });

  describe("link extraction", () => {
    it("extracts links with href and text", () => {
      const html =
        '<a href="https://a.com">Link A</a><a href="/local">Local</a>';
      const result = parse_html_metadata(html);
      expect(result.links).toEqual([
        { href: "https://a.com", text: "Link A" },
        { href: "/local", text: "Local" },
      ]);
    });

    it("skips anchors without href", () => {
      const result = parse_html_metadata('<a name="anchor">no href</a>');
      expect(result.links).toEqual([]);
    });

    it("handles empty link text", () => {
      const result = parse_html_metadata('<a href="https://x.com"></a>');
      expect(result.links).toEqual([{ href: "https://x.com", text: "" }]);
    });

    it("returns empty array when no links", () => {
      const result = parse_html_metadata("<p>no links</p>");
      expect(result.links).toEqual([]);
    });
  });

  describe("empty input", () => {
    it("handles empty string", () => {
      const result = parse_html_metadata("");
      expect(result.title).toBeNull();
      expect(result.headings).toEqual([]);
      expect(result.links).toEqual([]);
    });
  });
});
