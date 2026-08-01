import { describe, it, expect, vi } from "vitest";
import {
  note_export_styles,
  render_note_body_html,
  render_note_to_html,
} from "$lib/features/document/domain/note_html";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn(() => Promise.resolve(true)),
    render: vi.fn((id: string) =>
      Promise.resolve({ svg: `<svg data-mermaid-id="${id}"><g></g></svg>` }),
    ),
  },
}));

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// Highlighted code is wrapped in per-token spans, so the readable source only
// appears once the markup is stripped and the entities decoded.
function code_block_text(html: string): string {
  return (html.match(/<pre[\s\S]*?<\/pre>/)?.[0] ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&(lt|#x3C);/g, "<")
    .replace(/&(gt|#x3E);/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

describe("render_note_to_html", () => {
  it("emits a single self-contained document with the title", async () => {
    const html = await render_note_to_html("My Note", "Body text.");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>My Note</title>");
    expect(count(html, 'class="doc-title"')).toBe(1);
    expect(html).toContain("My Note");
    expect(html).toContain("Body text.");
  });

  it("renders body headings without duplicating them", async () => {
    const html = await render_note_to_html("Title", "# Section\n\nText.");
    expect(html).toContain("<h1>Section</h1>");
    expect(count(html, ">Section</h1>")).toBe(1);
  });

  it("strips YAML frontmatter from the body", async () => {
    const html = await render_note_to_html(
      "Note",
      "---\ntitle: Hidden\ntags: [a]\n---\n\nVisible body.",
    );
    expect(html).toContain("Visible body.");
    expect(html).not.toContain("tags: [a]");
  });

  it("inlines mermaid fences as SVG", async () => {
    const html = await render_note_to_html(
      "Note",
      "```mermaid\ngraph TD; A-->B;\n```",
    );
    expect(html).toContain("<svg");
    expect(html).toContain("mermaid-figure");
    expect(html).not.toContain("[mermaid diagram]");
  });

  it("typesets a ```math fence as KaTeX display math", async () => {
    const html = await render_note_to_html(
      "Note",
      "```math\n\\frac{a}{b}\n```",
    );
    expect(html).toContain('class="katex-display"');
  });

  it("typesets $$ blocks as KaTeX display math", async () => {
    const html = await render_note_to_html("Note", "$$\nx^2 + y^2\n$$");
    expect(html).toContain('class="katex-display"');
  });

  it("typesets inline $...$ as KaTeX without display mode", async () => {
    const html = await render_note_to_html("Note", "Mass is $E = mc^2$ here.");
    expect(html).toContain('<span class="katex">');
    expect(html).not.toContain('class="katex-display"');
  });

  it("renders code fences as <pre> blocks", async () => {
    const html = await render_note_to_html(
      "Note",
      "```ts\nconst x: number = 1;\n```",
    );
    expect(html).toContain("<pre");
    expect(html).toContain("const");
  });

  it("renders a thematic break as a single <hr>", async () => {
    const html = await render_note_to_html("Note", "Above\n\n---\n\nBelow");
    expect(count(html, "<hr")).toBe(1);
  });

  it("inlines the KaTeX stylesheet", async () => {
    const html = await render_note_to_html("Note", "$x$");
    expect(html).toContain(".katex");
    expect(html).toContain("@page");
  });

  describe("image rendering", () => {
    it("resolves canonical image src via the resolver and inlines as data URI", async () => {
      const calls: Array<{ src: string; kind: string }> = [];
      const html = await render_note_to_html("Note", "![alt](pic.png)", {
        image_resolver: async (src, kind) => {
          calls.push({ src, kind });
          return "data:image/png;base64,AAA";
        },
      });
      expect(calls).toEqual([{ src: "pic.png", kind: "canonical" }]);
      expect(html).toContain('src="data:image/png;base64,AAA"');
      expect(html).toContain('alt="alt"');
    });

    it("rewrites wiki-embed images to canonical syntax and passes wiki kind", async () => {
      const calls: Array<{ src: string; kind: string }> = [];
      const html = await render_note_to_html("Note", "![[banner.jpg]]", {
        image_resolver: async (src, kind) => {
          calls.push({ src, kind });
          return "data:image/jpeg;base64,BBB";
        },
      });
      expect(calls).toEqual([{ src: "banner.jpg", kind: "wiki" }]);
      expect(html).toContain('src="data:image/jpeg;base64,BBB"');
    });

    it("leaves non-image wiki embeds untouched", async () => {
      const calls: string[] = [];
      const html = await render_note_to_html("Note", "![[doc.pdf]]", {
        image_resolver: async (src) => {
          calls.push(src);
          return "data:application/pdf;base64,XYZ";
        },
      });
      expect(calls).toEqual([]);
      expect(html).not.toContain("data:application/pdf");
    });

    it("renders a placeholder when the resolver returns null", async () => {
      const html = await render_note_to_html("Note", "![missing](gone.png)", {
        image_resolver: async () => null,
      });
      expect(html).toContain('class="image-missing"');
      expect(html).toContain("missing");
      expect(html).not.toContain('src="gone.png"');
    });

    it("renders a placeholder when the resolver throws", async () => {
      const html = await render_note_to_html("Note", "![x](broken.png)", {
        image_resolver: async () => {
          throw new Error("nope");
        },
      });
      expect(html).toContain('class="image-missing"');
    });

    it("renders a placeholder when no resolver is provided", async () => {
      const html = await render_note_to_html("Note", "![alt](pic.png)");
      expect(html).toContain('class="image-missing"');
      expect(html).not.toContain('src="pic.png"');
    });
  });

  describe("raw HTML", () => {
    it("shows a raw HTML block as escaped source inside a <pre>, not as markup", async () => {
      const html = await render_note_to_html(
        "Note",
        '<div class="danger"><script>alert(1)</script></div>',
      );
      expect(html).toContain("<pre");
      expect(code_block_text(html)).toContain(
        '<div class="danger"><script>alert(1)</script></div>',
      );
      expect(html).not.toContain('<div class="danger">');
      expect(html).not.toContain("<script>");
    });

    it("shows inline raw HTML as code rather than dropping it into the document", async () => {
      const html = await render_note_to_html(
        "Note",
        "Press <kbd>Esc</kbd> to close.",
      );
      expect(html).toContain('<code class="raw-html">&lt;kbd&gt;</code>');
      expect(html).not.toContain("<kbd>");
    });

    it("renders a promoted iframe embed as a placeholder carrying its URL", async () => {
      const html = await render_note_to_html(
        "Note",
        '<iframe src="https://example.com/watch?v=1" title="Demo"></iframe>',
      );
      expect(html).toContain('class="embed-placeholder"');
      expect(html).toContain("Embedded page");
      expect(html).toContain("https://example.com/watch?v=1");
      expect(html).not.toContain("<iframe");
    });

    it("renders a promoted video embed as a placeholder carrying its URL", async () => {
      const html = await render_note_to_html(
        "Note",
        '<video src="clips/demo.mp4" controls></video>',
      );
      expect(html).toContain('class="embed-placeholder"');
      expect(html).toContain("Video");
      expect(html).toContain("clips/demo.mp4");
      expect(html).not.toContain("<video");
    });

    it("keeps surrounding prose intact around a promoted embed", async () => {
      const html = await render_note_to_html(
        "Note",
        'Before.\n\n<iframe src="https://example.com/e"></iframe>\n\nAfter.',
      );
      expect(html).toContain("Before.");
      expect(html).toContain("After.");
      expect(count(html, 'class="embed-placeholder"')).toBe(1);
    });
  });
});

describe("render_note_body_html", () => {
  it("emits only the note body, without a document shell", async () => {
    const body = await render_note_body_html("My Note", "Body text.");
    expect(body).not.toContain("<!doctype html>");
    expect(body).not.toContain("<style>");
    expect(body).toContain('<h1 class="doc-title">My Note</h1>');
    expect(body).toContain("Body text.");
  });

  it("escapes the title", async () => {
    const body = await render_note_body_html("A <b> & C", "x");
    expect(body).toContain("A &lt;b&gt; &amp; C");
  });
});

describe("note_export_styles", () => {
  it("bundles the KaTeX stylesheet with the print styles", async () => {
    const styles = await note_export_styles();
    expect(styles).toContain(".katex");
    expect(styles).toContain("@page");
    expect(styles).toContain(".embed-placeholder");
  });
});
