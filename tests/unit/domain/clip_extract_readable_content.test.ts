/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { extract_readable_content } from "$lib/features/clip/domain/extract_readable_content";

const LONG_PARAGRAPH =
  "The quick brown fox jumps over the lazy dog and keeps running through the forest, past the river, beyond the hills, into the long evening light where nothing much happens except more words accumulating to satisfy readability's content threshold. ".repeat(
    5,
  );

function article_page(): string {
  return `<!doctype html><html><head><title>Test Article — Site Name</title></head>
<body>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <article>
    <h1>Test Article</h1>
    <p>${LONG_PARAGRAPH}</p>
    <p>${LONG_PARAGRAPH}</p>
    <img src="/images/figure.png" alt="figure">
  </article>
  <footer>Copyright</footer>
</body></html>`;
}

describe("extract_readable_content", () => {
  it("extracts the article body and title", () => {
    const result = extract_readable_content(
      article_page(),
      "https://example.com/post",
    );
    expect(result.title).toContain("Test Article");
    expect(result.content_html).toContain("quick brown fox");
    expect(result.content_html).not.toContain("Copyright");
  });

  it("falls back to the body when readability finds no article", () => {
    const result = extract_readable_content(
      "<html><head><title>Tiny</title></head><body><p>Short.</p></body></html>",
      "https://example.com/",
    );
    expect(result.title).toBe("Tiny");
    expect(result.content_html).toContain("Short.");
  });

  it("never throws on empty input", () => {
    const result = extract_readable_content("", "https://example.com/");
    expect(result.title).toBeNull();
    expect(typeof result.content_html).toBe("string");
  });
});
