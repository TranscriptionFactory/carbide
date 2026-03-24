// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  create_md,
  render_tokens_to_pdf,
  export_note_as_pdf,
} from "$lib/features/document/domain/pdf_export";

function create_mock_doc() {
  const calls: { method: string; args: unknown[] }[] = [];

  const doc = {
    calls,
    text: vi.fn((...args: unknown[]) => calls.push({ method: "text", args })),
    setFont: vi.fn((...args: unknown[]) =>
      calls.push({ method: "setFont", args }),
    ),
    setFontSize: vi.fn((...args: unknown[]) =>
      calls.push({ method: "setFontSize", args }),
    ),
    setTextColor: vi.fn((...args: unknown[]) =>
      calls.push({ method: "setTextColor", args }),
    ),
    setDrawColor: vi.fn((...args: unknown[]) =>
      calls.push({ method: "setDrawColor", args }),
    ),
    setFillColor: vi.fn((...args: unknown[]) =>
      calls.push({ method: "setFillColor", args }),
    ),
    setLineWidth: vi.fn((...args: unknown[]) =>
      calls.push({ method: "setLineWidth", args }),
    ),
    splitTextToSize: vi.fn((text: string) => [text]),
    line: vi.fn((...args: unknown[]) => calls.push({ method: "line", args })),
    rect: vi.fn((...args: unknown[]) => calls.push({ method: "rect", args })),
    addPage: vi.fn(() => calls.push({ method: "addPage", args: [] })),
    save: vi.fn(),
    internal: { pageSize: { getHeight: () => 297 } },
  };

  return doc;
}

function text_calls(doc: ReturnType<typeof create_mock_doc>): string[] {
  return doc.text.mock.calls.map((c) => {
    const arg = c[0];
    return Array.isArray(arg) ? arg.join(" ") : String(arg);
  });
}

function parse(content: string) {
  return create_md().parse(content, {});
}

describe("render_tokens_to_pdf", () => {
  let doc: ReturnType<typeof create_mock_doc>;

  beforeEach(() => {
    doc = create_mock_doc();
  });

  it("renders the title", () => {
    render_tokens_to_pdf(doc, "My Title", []);
    expect(text_calls(doc)).toContain("My Title");
  });

  it("renders h1 heading with bold font", () => {
    render_tokens_to_pdf(doc, "T", parse("# Heading One"));
    expect(text_calls(doc)).toContain("Heading One");
    expect(doc.setFont).toHaveBeenCalledWith("helvetica", "bold");
  });

  it("renders h2 heading", () => {
    render_tokens_to_pdf(doc, "T", parse("## Heading Two"));
    expect(text_calls(doc)).toContain("Heading Two");
  });

  it("renders h3 heading", () => {
    render_tokens_to_pdf(doc, "T", parse("### Heading Three"));
    expect(text_calls(doc)).toContain("Heading Three");
  });

  it("renders paragraph text", () => {
    render_tokens_to_pdf(doc, "T", parse("Hello world paragraph."));
    expect(text_calls(doc)).toContain("Hello world paragraph.");
  });

  it("strips inline formatting to plain text", () => {
    render_tokens_to_pdf(doc, "T", parse("This is **bold** and *italic*"));
    const texts = text_calls(doc);
    expect(texts.some((t) => t.includes("bold") && t.includes("italic"))).toBe(
      true,
    );
  });

  it("renders code blocks with courier font", () => {
    render_tokens_to_pdf(doc, "T", parse("```\nconst x = 1;\n```"));
    expect(doc.setFont).toHaveBeenCalledWith("courier", "normal");
    expect(text_calls(doc)).toContain("const x = 1;");
  });

  it("renders code blocks with background rect", () => {
    render_tokens_to_pdf(doc, "T", parse("```\ncode\n```"));
    expect(doc.rect).toHaveBeenCalled();
    expect(doc.setFillColor).toHaveBeenCalledWith(246, 248, 250);
  });

  it("renders bullet list items with bullet marker", () => {
    render_tokens_to_pdf(doc, "T", parse("- item one\n- item two"));
    const texts = text_calls(doc);
    expect(texts).toContain("\u2022");
    expect(texts.some((t) => t.includes("item one"))).toBe(true);
    expect(texts.some((t) => t.includes("item two"))).toBe(true);
  });

  it("renders ordered list items with numbers", () => {
    render_tokens_to_pdf(doc, "T", parse("1. first\n2. second"));
    const texts = text_calls(doc);
    expect(texts).toContain("1.");
    expect(texts).toContain("2.");
  });

  it("renders horizontal rule as a line", () => {
    render_tokens_to_pdf(doc, "T", parse("---"));
    expect(doc.line).toHaveBeenCalled();
  });

  it("renders tables with rect cells", () => {
    render_tokens_to_pdf(doc, "T", parse("| A | B |\n|---|---|\n| 1 | 2 |"));
    expect(doc.rect).toHaveBeenCalled();
    const texts = text_calls(doc);
    expect(texts.some((t) => t.includes("A"))).toBe(true);
    expect(texts.some((t) => t.includes("1"))).toBe(true);
  });

  it("renders h1 with underline", () => {
    render_tokens_to_pdf(doc, "T", parse("# Title"));
    expect(doc.line).toHaveBeenCalled();
  });

  it("handles mixed content correctly", () => {
    const md =
      "# Title\n\nParagraph.\n\n## Section\n\n- item\n\n```\ncode\n```";
    render_tokens_to_pdf(doc, "T", parse(md));
    const texts = text_calls(doc);
    expect(texts.some((t) => t.includes("Title"))).toBe(true);
    expect(texts.some((t) => t.includes("Paragraph"))).toBe(true);
    expect(texts.some((t) => t.includes("Section"))).toBe(true);
    expect(texts.some((t) => t.includes("item"))).toBe(true);
    expect(texts.some((t) => t.includes("code"))).toBe(true);
  });

  it("adds page when content exceeds page height", () => {
    const long_content = Array.from(
      { length: 100 },
      (_, i) => `Line ${i}`,
    ).join("\n\n");
    render_tokens_to_pdf(doc, "T", parse(long_content));
    expect(doc.addPage).toHaveBeenCalled();
  });
});

describe("export_note_as_pdf", () => {
  const mock_invoke = vi.fn();
  const mock_dialog_save = vi.fn();
  const mock_output = vi.fn(() => new ArrayBuffer(10));

  beforeEach(() => {
    vi.clearAllMocks();
    mock_dialog_save.mockResolvedValue("/tmp/test.pdf");

    vi.doMock("@tauri-apps/plugin-dialog", () => ({
      save: mock_dialog_save,
    }));

    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: mock_invoke,
    }));

    vi.doMock("jspdf", () => ({
      jsPDF: vi.fn(() => ({
        text: vi.fn(),
        setFont: vi.fn(),
        setFontSize: vi.fn(),
        setTextColor: vi.fn(),
        setDrawColor: vi.fn(),
        setFillColor: vi.fn(),
        setLineWidth: vi.fn(),
        splitTextToSize: vi.fn((text: string) => [text]),
        line: vi.fn(),
        rect: vi.fn(),
        addPage: vi.fn(),
        output: mock_output,
        internal: { pageSize: { getHeight: () => 297 } },
      })),
    }));
  });

  it("shows save dialog with pdf filter", async () => {
    const { export_note_as_pdf: export_fn } =
      await import("$lib/features/document/domain/pdf_export");
    await export_fn("My Note", "Hello");
    expect(mock_dialog_save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: "My Note.pdf",
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      }),
    );
  });

  it("writes pdf bytes to chosen path", async () => {
    const { export_note_as_pdf: export_fn } =
      await import("$lib/features/document/domain/pdf_export");
    await export_fn("My Note", "Hello");
    expect(mock_invoke).toHaveBeenCalledWith("write_bytes_to_path", {
      path: "/tmp/test.pdf",
      data: expect.any(Array),
    });
  });

  it("does nothing when save dialog is cancelled", async () => {
    mock_dialog_save.mockResolvedValue(null);
    const { export_note_as_pdf: export_fn } =
      await import("$lib/features/document/domain/pdf_export");
    await export_fn("My Note", "Hello");
    expect(mock_invoke).not.toHaveBeenCalled();
  });
});
