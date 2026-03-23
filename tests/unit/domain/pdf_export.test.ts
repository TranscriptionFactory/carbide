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
    const container = getContainer();
    expect(container.innerHTML).toContain("<h1>");
    expect(container.innerHTML).toContain("Heading One");
    expect(container.innerHTML).toContain("</h1>");
  });

  it("converts h2 headings to HTML", async () => {
    await export_note_as_pdf("Test", "## Heading Two");
    const container = getContainer();
    expect(container.innerHTML).toContain("<h2>");
    expect(container.innerHTML).toContain("Heading Two");
    expect(container.innerHTML).toContain("</h2>");
  });

  it("converts h3 headings to HTML", async () => {
    await export_note_as_pdf("Test", "### Heading Three");
    const container = getContainer();
    expect(container.innerHTML).toContain("<h3>");
    expect(container.innerHTML).toContain("Heading Three");
    expect(container.innerHTML).toContain("</h3>");
  });

  it("preserves bold markdown as strong tags", async () => {
    await export_note_as_pdf("Test", "This is **bold** text");
    const container = getContainer();
    expect(container.innerHTML).toContain("<strong>");
    expect(container.innerHTML).toContain("bold");
    expect(container.innerHTML).toContain("</strong>");
  });

  it("preserves italic markdown as em tags", async () => {
    await export_note_as_pdf("Test", "This is *italic* text");
    const container = getContainer();
    expect(container.innerHTML).toContain("<em>");
    expect(container.innerHTML).toContain("italic");
    expect(container.innerHTML).toContain("</em>");
  });

  it("preserves inline code as code tags", async () => {
    await export_note_as_pdf("Test", "Use `const x = 1` here");
    const container = getContainer();
    expect(container.innerHTML).toContain("<code>");
    expect(container.innerHTML).toContain("const x = 1");
    expect(container.innerHTML).toContain("</code>");
  });

  it("preserves strikethrough markdown as s tags (strikethrough)", async () => {
    await export_note_as_pdf("Test", "~~deleted~~ text");
    const container = getContainer();
    expect(container.innerHTML).toContain("<s>");
    expect(container.innerHTML).toContain("deleted");
    expect(container.innerHTML).toContain("</s>");
  });

  it("converts links to anchor tags", async () => {
    await export_note_as_pdf("Test", "[example](https://example.com)");
    const container = getContainer();
    expect(container.innerHTML).toContain('<a href="https://example.com"');
    expect(container.innerHTML).toContain("example");
    expect(container.innerHTML).toContain("</a>");
  });

  it("converts lists to ul/li tags", async () => {
    await export_note_as_pdf("Test", "- item one\n- item two");
    const container = getContainer();
    expect(container.innerHTML).toContain("<ul>");
    expect(container.innerHTML).toContain("<li>");
    expect(container.innerHTML).toContain("item one");
    expect(container.innerHTML).toContain("</ul>");
  });

  it("converts code blocks to pre/code tags", async () => {
    await export_note_as_pdf("Test", "```\ncode here\n```");
    const container = getContainer();
    expect(container.innerHTML).toContain("<pre>");
    expect(container.innerHTML).toContain("<code>");
    expect(container.innerHTML).toContain("code here");
    expect(container.innerHTML).toContain("</code>");
    expect(container.innerHTML).toContain("</pre>");
  });

  it("handles mixed content with headings and paragraphs", async () => {
    await export_note_as_pdf(
      "Test",
      "# Title\n\nSome body text.\n\n## Section\n\nMore text.",
    );
    const container = getContainer();
    expect(container.innerHTML).toContain("<h1>");
    expect(container.innerHTML).toContain("Title");
    expect(container.innerHTML).toContain("<h2>");
    expect(container.innerHTML).toContain("Section");
    expect(container.innerHTML).toContain("Some body text");
    expect(container.innerHTML).toContain("More text");
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
