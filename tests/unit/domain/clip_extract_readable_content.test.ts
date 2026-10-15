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

  describe("figures are kept whole", () => {
    function page_with(figure_html: string, outside = ""): string {
      return `<!doctype html><html><head><title>Figures</title></head>
<body>
  <article>
    <h1>Figures</h1>
    <p>${LONG_PARAGRAPH}</p>
    ${figure_html}
    <p>${LONG_PARAGRAPH}</p>
  </article>
  ${outside}
</body></html>`;
    }

    function extract(figure_html: string, outside = ""): Document {
      const { content_html } = extract_readable_content(
        page_with(figure_html, outside),
        "https://example.com/post",
      );
      return new DOMParser().parseFromString(content_html, "text/html");
    }

    const thumbnail_grid = Array.from(
      { length: 8 },
      (_, i) =>
        `<a href="/full/${String(i)}.png"><img src="/thumb/${String(i)}.png" alt="thumb ${String(i)}"><span>label ${String(i)}</span></a>`,
    ).join("");

    it("keeps a linked thumbnail grid that link-density cleaning would drop", () => {
      const doc = extract(
        `<figure><div class="grid">${thumbnail_grid}</div><figcaption>Top examples</figcaption></figure>`,
      );
      expect(doc.querySelectorAll("figure img")).toHaveLength(8);
      expect(doc.querySelector("figcaption")?.textContent).toBe("Top examples");
    });

    it("keeps figures without a caption", () => {
      const doc = extract(`<figure><div>${thumbnail_grid}</div></figure>`);
      expect(doc.querySelectorAll("figure img")).toHaveLength(8);
    });

    it("unwraps buttons holding images and drops other controls", () => {
      const doc = extract(
        '<figure><button class="thumb"><img src="/a.png" alt="a"></button><button>Next</button><select><option>Layer 4</option></select><figcaption>Pick one</figcaption></figure>',
      );
      expect(doc.querySelector('figure img[alt="a"]')).not.toBeNull();
      expect(doc.querySelector("figure button, figure select")).toBeNull();
      expect(doc.body.textContent).not.toContain("Next");
      expect(doc.body.textContent).not.toContain("Layer 4");
    });

    it("drops hidden html but keeps aria-hidden svg graphics", () => {
      const doc = extract(
        '<figure><div class="slide" aria-hidden="true"><img src="/hidden-slide.png" alt="hidden"></div><div hidden><img src="/hidden-attr.png" alt="hidden2"></div><div style="display: none"><img src="/hidden-style.png" alt="hidden3"></div><svg aria-hidden="true" viewBox="0 0 10 10"><path d="M0 0 L10 10"></path></svg><img src="/shown.png" alt="shown"><figcaption>Slides</figcaption></figure>',
      );
      const alts = [...doc.querySelectorAll("figure img")].map((img) =>
        img.getAttribute("alt"),
      );
      expect(alts).toEqual(["shown"]);
      expect(doc.querySelector("figure svg path")).not.toBeNull();
    });

    it("absolutizes urls and promotes lazy image sources", () => {
      const doc = extract(
        '<figure><a href="/full/1.png"><img src="/thumb/1.png" alt="one"></a><img src="data:image/gif;base64,R0lGOD" data-src="/lazy.png" alt="lazy"><svg viewBox="0 0 4 4"><image href="/node.webp"></image><image data-lazy-href="/lazy-node.webp"></image></svg><figcaption>Urls</figcaption></figure>',
      );
      expect(doc.querySelector('img[alt="one"]')?.getAttribute("src")).toBe(
        "https://example.com/thumb/1.png",
      );
      expect(doc.querySelector("figure a")?.getAttribute("href")).toBe(
        "https://example.com/full/1.png",
      );
      expect(doc.querySelector('img[alt="lazy"]')?.getAttribute("src")).toBe(
        "https://example.com/lazy.png",
      );
      const svg_hrefs = [...doc.querySelectorAll("svg image")].map((image) =>
        image.getAttribute("href"),
      );
      expect(svg_hrefs).toEqual([
        "https://example.com/node.webp",
        "https://example.com/lazy-node.webp",
      ]);
    });

    it("does not pull in figures from outside the article", () => {
      const doc = extract(
        '<figure><img src="/inline.png" alt="inline"><figcaption>Inline</figcaption></figure>',
        '<footer><figure><img src="/footer.png" alt="footer"><figcaption>Footer</figcaption></figure></footer>',
      );
      expect(doc.querySelector('img[alt="inline"]')).not.toBeNull();
      expect(doc.querySelector('img[alt="footer"]')).toBeNull();
      expect(doc.querySelector("[data-carbide-figure-slot]")).toBeNull();
    });
  });
});
