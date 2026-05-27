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
});
