// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mock_html = vi.fn();
const mock_save = vi.fn();

const mockjspdf_instance = {
  internal: {
    pageSize: {
      getHeight: () => 297,
    },
  },
  html: mock_html,
  save: mock_save,
};

const MockJsPDF = vi.fn(() => mockjspdf_instance);

vi.mock("jspdf", () => ({
  jsPDF: MockJsPDF,
}));

import { export_note_as_pdf } from "$lib/features/document/domain/pdf_export";

function getContainer(): HTMLElement {
  const calls = mock_html.mock.calls;
  if (calls.length === 0 || !calls[0]?.[0]) {
    throw new Error("No mock calls found");
  }
  return calls[0][0] as HTMLElement;
}

function getShadowContent(): string {
  const container = getContainer();
  const shadow = container.shadowRoot;
  if (!shadow) {
    throw new Error("No shadow root found");
  }
  return shadow.innerHTML;
}

describe("export_note_as_pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock_html.mockImplementation(
      async (
        _element: unknown,
        options: { callback: (doc: unknown) => void },
      ) => {
        options.callback(mockjspdf_instance);
        return Promise.resolve();
      },
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls jsPDF save with the note title as filename", async () => {
    await export_note_as_pdf("My Note", "Hello world");
    expect(mock_save).toHaveBeenCalledWith("My Note.pdf");
  });

  it("converts h1 headings to HTML", async () => {
    await export_note_as_pdf("Test", "# Heading One");
    const html = getShadowContent();
    expect(html).toContain("<h1>");
    expect(html).toContain("Heading One");
    expect(html).toContain("</h1>");
  });

  it("converts h2 headings to HTML", async () => {
    await export_note_as_pdf("Test", "## Heading Two");
    const html = getShadowContent();
    expect(html).toContain("<h2>");
    expect(html).toContain("Heading Two");
    expect(html).toContain("</h2>");
  });

  it("converts h3 headings to HTML", async () => {
    await export_note_as_pdf("Test", "### Heading Three");
    const html = getShadowContent();
    expect(html).toContain("<h3>");
    expect(html).toContain("Heading Three");
    expect(html).toContain("</h3>");
  });

  it("preserves bold markdown as strong tags", async () => {
    await export_note_as_pdf("Test", "This is **bold** text");
    const html = getShadowContent();
    expect(html).toContain("<strong>");
    expect(html).toContain("bold");
    expect(html).toContain("</strong>");
  });

  it("preserves italic markdown as em tags", async () => {
    await export_note_as_pdf("Test", "This is *italic* text");
    const html = getShadowContent();
    expect(html).toContain("<em>");
    expect(html).toContain("italic");
    expect(html).toContain("</em>");
  });

  it("preserves inline code as code tags", async () => {
    await export_note_as_pdf("Test", "Use `const x = 1` here");
    const html = getShadowContent();
    expect(html).toContain("<code>");
    expect(html).toContain("const x = 1");
    expect(html).toContain("</code>");
  });

  it("preserves strikethrough markdown as s tags", async () => {
    await export_note_as_pdf("Test", "~~deleted~~ text");
    const html = getShadowContent();
    expect(html).toContain("<s>");
    expect(html).toContain("deleted");
    expect(html).toContain("</s>");
  });

  it("converts links to anchor tags", async () => {
    await export_note_as_pdf("Test", "[example](https://example.com)");
    const html = getShadowContent();
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain("example");
    expect(html).toContain("</a>");
  });

  it("converts lists to ul/li tags", async () => {
    await export_note_as_pdf("Test", "- item one\n- item two");
    const html = getShadowContent();
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>");
    expect(html).toContain("item one");
    expect(html).toContain("</ul>");
  });

  it("converts code blocks to pre/code tags", async () => {
    await export_note_as_pdf("Test", "```\ncode here\n```");
    const html = getShadowContent();
    expect(html).toContain("<pre>");
    expect(html).toContain("<code>");
    expect(html).toContain("code here");
    expect(html).toContain("</code>");
    expect(html).toContain("</pre>");
  });

  it("handles mixed content with headings and paragraphs", async () => {
    await export_note_as_pdf(
      "Test",
      "# Title\n\nSome body text.\n\n## Section\n\nMore text.",
    );
    const html = getShadowContent();
    expect(html).toContain("<h1>");
    expect(html).toContain("Title");
    expect(html).toContain("<h2>");
    expect(html).toContain("Section");
    expect(html).toContain("Some body text");
    expect(html).toContain("More text");
  });

  it("calls jsPDF.html with correct options", async () => {
    await export_note_as_pdf("Test", "Content");
    expect(mock_html).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        width: 170,
        windowWidth: 800,
      }),
    );
  });

  it("removes container after export", async () => {
    const removeSpy = vi.spyOn(Element.prototype, "remove");
    await export_note_as_pdf("Test", "Content");
    expect(removeSpy).toHaveBeenCalled();
    removeSpy.mockRestore();
  });
});
