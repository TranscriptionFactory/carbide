// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mock_html = vi.fn();
const mock_save = vi.fn();

const mock_set_font_size = vi.fn();
const mock_set_font = vi.fn();
const mock_text = vi.fn();
const mock_split_text_to_size = vi.fn((text: string) => [text]);
const mock_add_page = vi.fn();

const mockjspdf_instance = {
  internal: {
    pageSize: {
      getHeight: () => 297,
    },
  },
  addPage: mock_add_page,
  html: mock_html,
  save: mock_save,
  setFont: mock_set_font,
  setFontSize: mock_set_font_size,
  splitTextToSize: mock_split_text_to_size,
  text: mock_text,
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

function getContainerContent(): string {
  return getContainer().innerHTML;
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
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("calls jsPDF save with the note title as filename", async () => {
    await export_note_as_pdf("My Note", "Hello world");
    expect(mock_save).toHaveBeenCalledWith("My Note.pdf");
  });

  it("converts h1 headings to HTML", async () => {
    await export_note_as_pdf("Test", "# Heading One");
    const html = getContainerContent();
    expect(html).toContain("<h1>");
    expect(html).toContain("Heading One");
    expect(html).toContain("</h1>");
  });

  it("converts h2 headings to HTML", async () => {
    await export_note_as_pdf("Test", "## Heading Two");
    const html = getContainerContent();
    expect(html).toContain("<h2>");
    expect(html).toContain("Heading Two");
    expect(html).toContain("</h2>");
  });

  it("converts h3 headings to HTML", async () => {
    await export_note_as_pdf("Test", "### Heading Three");
    const html = getContainerContent();
    expect(html).toContain("<h3>");
    expect(html).toContain("Heading Three");
    expect(html).toContain("</h3>");
  });

  it("preserves bold markdown as strong tags", async () => {
    await export_note_as_pdf("Test", "This is **bold** text");
    const html = getContainerContent();
    expect(html).toContain("<strong>");
    expect(html).toContain("bold");
    expect(html).toContain("</strong>");
  });

  it("preserves italic markdown as em tags", async () => {
    await export_note_as_pdf("Test", "This is *italic* text");
    const html = getContainerContent();
    expect(html).toContain("<em>");
    expect(html).toContain("italic");
    expect(html).toContain("</em>");
  });

  it("preserves inline code as code tags", async () => {
    await export_note_as_pdf("Test", "Use `const x = 1` here");
    const html = getContainerContent();
    expect(html).toContain("<code>");
    expect(html).toContain("const x = 1");
    expect(html).toContain("</code>");
  });

  it("preserves strikethrough markdown as s tags", async () => {
    await export_note_as_pdf("Test", "~~deleted~~ text");
    const html = getContainerContent();
    expect(html).toContain("<s>");
    expect(html).toContain("deleted");
    expect(html).toContain("</s>");
  });

  it("converts links to anchor tags", async () => {
    await export_note_as_pdf("Test", "[example](https://example.com)");
    const html = getContainerContent();
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain("example");
    expect(html).toContain("</a>");
  });

  it("converts lists to ul/li tags", async () => {
    await export_note_as_pdf("Test", "- item one\n- item two");
    const html = getContainerContent();
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>");
    expect(html).toContain("item one");
    expect(html).toContain("</ul>");
  });

  it("converts code blocks to pre/code tags", async () => {
    await export_note_as_pdf("Test", "```\ncode here\n```");
    const html = getContainerContent();
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
    const html = getContainerContent();
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

  it("falls back to text export when html rendering stalls", async () => {
    vi.useFakeTimers();
    mock_html.mockImplementation(() => new Promise<void>(() => {}));

    const export_promise = export_note_as_pdf("Test", "Plain body line");
    await vi.advanceTimersByTimeAsync(15_000);
    await export_promise;

    expect(mock_split_text_to_size).toHaveBeenCalledWith(
      "Plain body line",
      expect.any(Number),
    );
    expect(mock_save).toHaveBeenCalledWith("Test.pdf");

    vi.useRealTimers();
  });

  it("removes container after export", async () => {
    const removeSpy = vi.spyOn(Element.prototype, "remove");
    await export_note_as_pdf("Test", "Content");
    expect(removeSpy).toHaveBeenCalled();
    removeSpy.mockRestore();
  });
});
