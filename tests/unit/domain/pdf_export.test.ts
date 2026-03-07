import { describe, it, expect, vi, beforeEach } from "vitest";

const mock_text = vi.fn();
const mock_split_text_to_size = vi.fn((text: string) => [text]);
const mock_set_font_size = vi.fn();
const mock_set_font = vi.fn();
const mock_add_page = vi.fn();
const mock_save = vi.fn();
const mock_output = vi.fn(() => new ArrayBuffer(8));

const mock_internal = {
  pageSize: {
    getHeight: () => 297,
  },
};

const MockJsPDF = vi.fn(() => ({
  internal: mock_internal,
  text: mock_text,
  splitTextToSize: mock_split_text_to_size,
  setFontSize: mock_set_font_size,
  setFont: mock_set_font,
  addPage: mock_add_page,
  save: mock_save,
  output: mock_output,
}));

vi.mock("jspdf", () => ({
  jsPDF: MockJsPDF,
}));

import { export_note_as_pdf } from "$lib/features/document/domain/pdf_export";

describe("export_note_as_pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock_split_text_to_size.mockImplementation((text: string) => [text]);
  });

  it("calls jsPDF save with the note title as filename", async () => {
    await export_note_as_pdf("My Note", "Hello world");
    expect(mock_save).toHaveBeenCalledWith("My Note.pdf");
  });

  it("renders h1 headings with bold font and larger size", async () => {
    await export_note_as_pdf("Test", "# Heading One");
    expect(mock_set_font).toHaveBeenCalledWith("helvetica", "bold");
    expect(mock_set_font_size).toHaveBeenCalledWith(20);
    expect(mock_text).toHaveBeenCalledWith(
      "Heading One",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("renders h2 headings with correct font size", async () => {
    await export_note_as_pdf("Test", "## Heading Two");
    expect(mock_set_font_size).toHaveBeenCalledWith(16);
    expect(mock_text).toHaveBeenCalledWith(
      "Heading Two",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("renders h3 headings with correct font size", async () => {
    await export_note_as_pdf("Test", "### Heading Three");
    expect(mock_set_font_size).toHaveBeenCalledWith(13);
    expect(mock_text).toHaveBeenCalledWith(
      "Heading Three",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("strips bold markdown before rendering text", async () => {
    await export_note_as_pdf("Test", "This is **bold** text");
    expect(mock_text).toHaveBeenCalledWith(
      "This is bold text",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("strips italic markdown before rendering text", async () => {
    await export_note_as_pdf("Test", "This is *italic* text");
    expect(mock_text).toHaveBeenCalledWith(
      "This is italic text",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("strips inline code markdown before rendering text", async () => {
    await export_note_as_pdf("Test", "Use `const x = 1` here");
    expect(mock_text).toHaveBeenCalledWith(
      "Use const x = 1 here",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("strips strikethrough markdown before rendering text", async () => {
    await export_note_as_pdf("Test", "~~deleted~~ text");
    expect(mock_text).toHaveBeenCalledWith(
      "deleted text",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("adds a new page when content exceeds page height", async () => {
    const many_lines = Array.from(
      { length: 50 },
      (_, i) => `Line ${String(i + 1)}`,
    ).join("\n");
    await export_note_as_pdf("Test", many_lines);
    expect(mock_add_page).toHaveBeenCalled();
  });

  it("skips empty lines without calling text", async () => {
    await export_note_as_pdf("Test", "\n\n");
    expect(mock_text).not.toHaveBeenCalled();
  });

  it("handles mixed content with headings and paragraphs", async () => {
    const content = "# Title\n\nSome body text.\n\n## Section\n\nMore text.";
    await export_note_as_pdf("Test", content);

    const text_calls = mock_text.mock.calls.map((call: unknown[]) => call[0]);
    expect(text_calls).toContain("Title");
    expect(text_calls).toContain("Some body text.");
    expect(text_calls).toContain("Section");
    expect(text_calls).toContain("More text.");
  });
});
