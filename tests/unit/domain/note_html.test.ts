import { describe, it, expect, vi } from "vitest";
import { render_note_to_html } from "$lib/features/document/domain/note_html";

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
});
