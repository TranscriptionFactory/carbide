// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  export_note_as_pdf,
  build_print_document,
  create_md,
} from "$lib/features/document/domain/pdf_export";

function render_markdown(content: string): string {
  const md = create_md();
  return build_print_document("Test", md.render(content));
}

describe("build_print_document", () => {
  it("renders title as h1", () => {
    const html = build_print_document("My Note", "<p>body</p>");
    expect(html).toContain("<h1>My Note</h1>");
  });

  it("escapes HTML in the title", () => {
    const html = build_print_document("<script>alert(1)</script>", "");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("includes body HTML", () => {
    const html = build_print_document("T", "<p>hello world</p>");
    expect(html).toContain("<p>hello world</p>");
  });

  it("includes print styles", () => {
    const html = build_print_document("T", "");
    expect(html).toContain("@page");
    expect(html).toContain("size: A4");
  });
});

describe("markdown rendering", () => {
  it("converts h1 headings", () => {
    const html = render_markdown("# Heading One");
    expect(html).toContain("<h1>Heading One</h1>");
  });

  it("converts h2 headings", () => {
    const html = render_markdown("## Heading Two");
    expect(html).toContain("<h2>Heading Two</h2>");
  });

  it("converts h3 headings", () => {
    const html = render_markdown("### Heading Three");
    expect(html).toContain("<h3>Heading Three</h3>");
  });

  it("preserves bold as strong tags", () => {
    const html = render_markdown("This is **bold** text");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("preserves italic as em tags", () => {
    const html = render_markdown("This is *italic* text");
    expect(html).toContain("<em>italic</em>");
  });

  it("preserves inline code", () => {
    const html = render_markdown("Use `const x = 1` here");
    expect(html).toContain("<code>const x = 1</code>");
  });

  it("preserves strikethrough as s tags", () => {
    const html = render_markdown("~~deleted~~ text");
    expect(html).toContain("<s>deleted</s>");
  });

  it("converts links to anchor tags", () => {
    const html = render_markdown("[example](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("example</a>");
  });

  it("converts lists to ul/li", () => {
    const html = render_markdown("- item one\n- item two");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>item one</li>");
    expect(html).toContain("<li>item two</li>");
  });

  it("converts code blocks to pre/code", () => {
    const html = render_markdown("```\ncode here\n```");
    expect(html).toContain("<pre>");
    expect(html).toContain("<code>");
    expect(html).toContain("code here");
  });

  it("handles mixed content", () => {
    const html = render_markdown(
      "# Title\n\nSome body text.\n\n## Section\n\nMore text.",
    );
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<h2>Section</h2>");
    expect(html).toContain("Some body text.");
    expect(html).toContain("More text.");
  });
});

describe("export_note_as_pdf", () => {
  let captured_html: string | null = null;

  afterEach(() => {
    captured_html = null;
    document.querySelectorAll("iframe").forEach((el) => el.remove());
  });

  async function run_export(title: string, content: string): Promise<void> {
    const original_create = document.createElement.bind(document);
    const create_spy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string, options?: ElementCreationOptions) => {
        const el = original_create(tag, options);
        if (tag === "iframe") {
          const real_content_doc =
            Object.getOwnPropertyDescriptor(
              HTMLIFrameElement.prototype,
              "contentDocument",
            ) ??
            Object.getOwnPropertyDescriptor(
              Object.getPrototypeOf(HTMLIFrameElement.prototype),
              "contentDocument",
            );

          const real_content_window = Object.getOwnPropertyDescriptor(
            HTMLIFrameElement.prototype,
            "contentWindow",
          );

          Object.defineProperty(el, "contentWindow", {
            get() {
              const win = real_content_window?.get?.call(el);
              if (!win) return null;
              const original_print = win.print.bind(win);
              return new Proxy(win, {
                get(target, prop) {
                  if (prop === "print") {
                    return () => {
                      const doc = real_content_doc?.get?.call(el);
                      if (doc) {
                        captured_html = doc.documentElement.innerHTML;
                      }
                      target.dispatchEvent(new Event("afterprint"));
                    };
                  }
                  const val = Reflect.get(target, prop);
                  return typeof val === "function" ? val.bind(target) : val;
                },
              });
            },
          });
        }
        return el;
      });

    try {
      await export_note_as_pdf(title, content);
    } finally {
      create_spy.mockRestore();
    }
  }

  it("calls print on the iframe", async () => {
    await run_export("Test", "Hello");
    expect(captured_html).not.toBeNull();
  });

  it("renders markdown content in the print document", async () => {
    await run_export("My Note", "# Heading\n\nParagraph text.");
    expect(captured_html).toContain("<h1>My Note</h1>");
    expect(captured_html).toContain("<h1>Heading</h1>");
    expect(captured_html).toContain("Paragraph text.");
  });

  it("removes iframe after export completes", async () => {
    await run_export("Test", "Content");
    expect(document.querySelector("iframe")).toBeNull();
  });
});
