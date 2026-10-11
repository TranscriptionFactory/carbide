import { describe, it, expect, vi } from "vitest";
import {
  note_export_styles,
  render_note_body_html,
} from "$lib/features/document/domain/note_html";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn(() => Promise.resolve(true)),
    render: vi.fn(() => Promise.resolve({ svg: "<svg></svg>" })),
  },
}));

async function render(markdown: string): Promise<string> {
  const html = await render_note_body_html("T", markdown);
  return html.replace(/^<h1 class="doc-title">T<\/h1>\n/, "");
}

function title_of(html: string): string {
  return (
    html.match(/<span class="callout-title-inner">([\s\S]*?)<\/span>/)?.[1] ??
    ""
  );
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("note export callouts", () => {
  it("renders an untitled callout with the capitalised type as its title", async () => {
    const html = await render("> [!note]\n> Body text.");

    expect(html).toContain('<div class="callout" data-callout="note">');
    expect(title_of(html)).toBe("Note");
    expect(html).toContain('<div class="callout-content">');
    expect(html).toContain("<p>Body text.</p>");
    expect(html).not.toContain("[!note]");
    expect(html).not.toContain("<blockquote>");
  });

  it("renders a custom title and markdown body", async () => {
    const html = await render(
      [
        "> [!warning] Custom *title*",
        "> - **bold** item",
        "> - `code` item",
        ">",
        "> $x^2$",
      ].join("\n"),
    );

    expect(html).toContain('data-callout="warning"');
    expect(title_of(html)).toBe("Custom <em>title</em>");
    expect(html).toContain("<li><strong>bold</strong> item</li>");
    expect(html).toContain("<li><code>code</code> item</li>");
    expect(html).toContain('class="katex"');
  });

  it("keeps body text on the directive paragraph's continuation lines", async () => {
    const html = await render("> [!tip] Heads up\n> First line\n> second line");

    expect(title_of(html)).toBe("Heads up");
    expect(html).toContain("<p>First line\nsecond line</p>");
  });

  it("matches the type case-insensitively", async () => {
    const html = await render("> [!WARNING]\n> Body");

    expect(html).toContain('data-callout="warning"');
    expect(title_of(html)).toBe("Warning");
  });

  it("styles aliases as their canonical type but titles them by the alias", async () => {
    const html = await render("> [!caution]\n> Body");

    expect(html).toContain('data-callout="warning"');
    expect(title_of(html)).toBe("Caution");
  });

  it("styles an unknown type as a note but keeps its name as the title", async () => {
    const html = await render("> [!mystery]\n> Body");

    expect(html).toContain('data-callout="note"');
    expect(title_of(html)).toBe("Mystery");
  });

  it("renders the type's icon in the title", async () => {
    const html = await render("> [!bug]\n> Body");

    expect(html).toMatch(
      /<div class="callout-title"><span class="callout-icon"><svg[^>]*>[\s\S]*?<\/svg><\/span>/,
    );
  });

  it.each(["+", "-"])(
    "expands a callout with fold marker %s and drops the marker from the title",
    async (marker) => {
      const html = await render(`> [!tip]${marker} Folded\n> Hidden body`);

      expect(title_of(html)).toBe("Folded");
      expect(html).toContain("<p>Hidden body</p>");
      expect(html).not.toContain(`]${marker}`);
    },
  );

  it.each(["+", "-"])(
    "uses the default title for a bare fold marker %s",
    async (marker) => {
      const html = await render(`> [!tip]${marker}\n> Body`);

      expect(title_of(html)).toBe("Tip");
    },
  );

  it("renders a callout nested inside a callout", async () => {
    const html = await render(
      "> [!note] Outer\n> Outer body\n>\n> > [!danger] Inner\n> > Inner body",
    );

    expect(count(html, '<div class="callout"')).toBe(2);
    expect(html).toContain('data-callout="danger"');
    const inner_at = html.indexOf('data-callout="danger"');
    const outer_content_close = html.lastIndexOf("</div>\n</div>");
    expect(inner_at).toBeGreaterThan(html.indexOf("Outer body"));
    expect(inner_at).toBeLessThan(outer_content_close);
    expect(html).toContain("<p>Inner body</p>");
    expect(html).not.toContain("<blockquote>");
  });

  it("renders a plain blockquote nested inside a callout", async () => {
    const html = await render("> [!info]\n> > quoted line");

    expect(html).toContain('data-callout="info"');
    expect(html).toContain("<blockquote>\n<p>quoted line</p>\n</blockquote>");
  });

  it("applies a sanitised custom colour", async () => {
    const html = await render("> [!note|purple]\n> Body");

    expect(html).toContain(
      '<div class="callout" data-callout="note" style="--callout-color: purple">',
    );
  });

  it("drops an unsafe custom colour", async () => {
    const html = await render('> [!note|red;"x]\n> Body');

    expect(html).toContain('<div class="callout" data-callout="note">');
  });

  it("leaves a blockquote without a directive unchanged", async () => {
    const html = await render("> Just a quote\n> [!note] not first");

    expect(html).toBe(
      "<blockquote>\n<p>Just a quote\n[!note] not first</p>\n</blockquote>\n",
    );
  });

  it("does not treat a directive after other text as a callout", async () => {
    const html = await render("> text [!note]");

    expect(html).toBe("<blockquote>\n<p>text [!note]</p>\n</blockquote>\n");
  });
});

describe("note export callout styles", () => {
  it("styles the callout box, title and icon", async () => {
    const css = await note_export_styles();

    expect(css).toMatch(/\.callout \{[^}]*border-left:[^}]*\}/);
    expect(css).toMatch(/\.callout \{[^}]*background:[^}]*\}/);
    expect(css).toMatch(/\.callout-title \{[^}]*font-weight: 600;[^}]*\}/);
    expect(css).toMatch(/\.callout-icon svg \{[^}]*\}/);
  });

  it("keeps the title with the first body line across page breaks", async () => {
    const css = await note_export_styles();

    expect(css).toMatch(
      /\.callout-title \{[^}]*break-inside: avoid;[^}]*break-after: avoid;[^}]*\}/,
    );
    expect(css).not.toMatch(/\.callout \{[^}]*break-inside: avoid;/);
  });

  it("colours notes by default and other canonical types by selector", async () => {
    const css = await note_export_styles();

    expect(css).toMatch(/\.callout \{[^}]*--callout-color:[^}]*\}/);
    for (const type of ["warning", "danger", "success", "quote"]) {
      expect(css).toContain(`[data-callout="${type}"]`);
    }
  });
});
