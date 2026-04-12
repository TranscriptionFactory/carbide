// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  create_md,
  render_tokens_to_pdf,
  extract_inline_spans,
  export_note_as_pdf,
} from "$lib/features/document/domain/pdf_export";
import type { JsPDFDoc } from "$lib/features/document/domain/pdf_export";

function create_mock_doc(): JsPDFDoc & {
  calls: { method: string; args: unknown[] }[];
  text: ReturnType<typeof vi.fn>;
  setFont: ReturnType<typeof vi.fn>;
  setFontSize: ReturnType<typeof vi.fn>;
  setTextColor: ReturnType<typeof vi.fn>;
  setDrawColor: ReturnType<typeof vi.fn>;
  setFillColor: ReturnType<typeof vi.fn>;
  setLineWidth: ReturnType<typeof vi.fn>;
  getTextWidth: ReturnType<typeof vi.fn>;
  splitTextToSize: ReturnType<typeof vi.fn>;
  line: ReturnType<typeof vi.fn>;
  rect: ReturnType<typeof vi.fn>;
  addPage: ReturnType<typeof vi.fn>;
  addFileToVFS: ReturnType<typeof vi.fn>;
  addFont: ReturnType<typeof vi.fn>;
} {
  const calls: { method: string; args: unknown[] }[] = [];

  return {
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
    getTextWidth: vi.fn((text: string) => text.length * 1.5),
    splitTextToSize: vi.fn((text: string) => [text]),
    line: vi.fn((...args: unknown[]) => calls.push({ method: "line", args })),
    rect: vi.fn((...args: unknown[]) => calls.push({ method: "rect", args })),
    addPage: vi.fn(() => calls.push({ method: "addPage", args: [] })),
    addFileToVFS: vi.fn(),
    addFont: vi.fn(),
    save: vi.fn(),
    internal: { pageSize: { getHeight: () => 297 } },
  };
}

function all_text(doc: ReturnType<typeof create_mock_doc>): string {
  return doc.text.mock.calls.map((c: unknown[]) => String(c[0])).join("");
}

function text_calls(doc: ReturnType<typeof create_mock_doc>): string[] {
  return doc.text.mock.calls.map((c: unknown[]) => {
    const arg = c[0];
    return Array.isArray(arg) ? arg.join(" ") : String(arg);
  });
}

function font_calls(doc: ReturnType<typeof create_mock_doc>): string[] {
  return doc.setFont.mock.calls.map((c: unknown[]) => `${c[0]}:${c[1]}`);
}

function parse(content: string) {
  return create_md().parse(content, {});
}

describe("extract_inline_spans", () => {
  it("extracts plain text as a single span", () => {
    const tokens = parse("Hello world");
    const inline = tokens.find((t) => t.type === "inline")!;
    const spans = extract_inline_spans(inline);
    expect(spans).toEqual([
      { text: "Hello world", bold: false, italic: false, code: false },
    ]);
  });

  it("extracts bold spans", () => {
    const tokens = parse("before **bold** after");
    const inline = tokens.find((t) => t.type === "inline")!;
    const spans = extract_inline_spans(inline);
    expect(spans).toHaveLength(3);
    expect(spans[0]).toEqual({
      text: "before ",
      bold: false,
      italic: false,
      code: false,
    });
    expect(spans[1]).toEqual({
      text: "bold",
      bold: true,
      italic: false,
      code: false,
    });
    expect(spans[2]).toEqual({
      text: " after",
      bold: false,
      italic: false,
      code: false,
    });
  });

  it("extracts italic spans", () => {
    const tokens = parse("*italic* text");
    const inline = tokens.find((t) => t.type === "inline")!;
    const spans = extract_inline_spans(inline);
    expect(spans[0]).toEqual({
      text: "italic",
      bold: false,
      italic: true,
      code: false,
    });
  });

  it("extracts nested bold+italic", () => {
    const tokens = parse("**bold *nested***");
    const inline = tokens.find((t) => t.type === "inline")!;
    const spans = extract_inline_spans(inline);
    const nested = spans.find((s) => s.text === "nested");
    expect(nested?.bold).toBe(true);
    expect(nested?.italic).toBe(true);
  });

  it("extracts inline code", () => {
    const tokens = parse("use `code` here");
    const inline = tokens.find((t) => t.type === "inline")!;
    const spans = extract_inline_spans(inline);
    const code_span = spans.find((s) => s.text === "code");
    expect(code_span?.code).toBe(true);
    expect(code_span?.bold).toBe(false);
  });
});

describe("render_tokens_to_pdf", () => {
  let doc: ReturnType<typeof create_mock_doc>;

  beforeEach(() => {
    doc = create_mock_doc();
  });

  it("renders the title", () => {
    render_tokens_to_pdf(doc, "My Title", []);
    expect(all_text(doc)).toContain("My Title");
  });

  it("renders h1 heading with bold font", () => {
    render_tokens_to_pdf(doc, "T", parse("# Heading One"));
    expect(all_text(doc)).toContain("Heading");
    expect(all_text(doc)).toContain("One");
    expect(doc.setFont).toHaveBeenCalledWith("Inter", "bold");
  });

  it("renders h2 heading", () => {
    render_tokens_to_pdf(doc, "T", parse("## Heading Two"));
    expect(all_text(doc)).toContain("Heading");
    expect(all_text(doc)).toContain("Two");
  });

  it("renders h3 heading", () => {
    render_tokens_to_pdf(doc, "T", parse("### Heading Three"));
    expect(all_text(doc)).toContain("Heading");
    expect(all_text(doc)).toContain("Three");
  });

  it("renders paragraph text", () => {
    render_tokens_to_pdf(doc, "T", parse("Hello world paragraph."));
    expect(all_text(doc)).toContain("Hello");
    expect(all_text(doc)).toContain("world");
    expect(all_text(doc)).toContain("paragraph.");
  });

  it("renders bold text with bold font", () => {
    render_tokens_to_pdf(doc, "T", parse("This is **bold** text"));
    expect(all_text(doc)).toContain("bold");
    expect(font_calls(doc)).toContain("Inter:bold");
  });

  it("renders italic text with italic font", () => {
    render_tokens_to_pdf(doc, "T", parse("This is *italic* text"));
    expect(all_text(doc)).toContain("italic");
    expect(font_calls(doc)).toContain("Inter:italic");
  });

  it("renders bold+italic with bolditalic font", () => {
    render_tokens_to_pdf(doc, "T", parse("***both***"));
    expect(all_text(doc)).toContain("both");
    expect(font_calls(doc)).toContain("Inter:bolditalic");
  });

  it("renders inline code with courier font", () => {
    render_tokens_to_pdf(doc, "T", parse("use `myFunc()` here"));
    expect(all_text(doc)).toContain("myFunc()");
    expect(doc.setFont).toHaveBeenCalledWith("courier", "normal");
  });

  it("preserves Unicode text natively", () => {
    render_tokens_to_pdf(doc, "T", parse("oral gavage \u2192 acute model"));
    const rendered = all_text(doc);
    expect(rendered).toContain("\u2192");
    expect(rendered).toContain("oral");
    expect(rendered).toContain("gavage");
    expect(rendered).toContain("acute");
    expect(rendered).toContain("model");
  });

  it("renders code blocks with courier font", () => {
    render_tokens_to_pdf(doc, "T", parse("```\nconst x = 1;\n```"));
    expect(doc.setFont).toHaveBeenCalledWith("courier", "normal");
    expect(all_text(doc)).toContain("const x = 1;");
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
    expect(all_text(doc)).toContain("item");
    expect(all_text(doc)).toContain("one");
    expect(all_text(doc)).toContain("two");
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
    const rendered = all_text(doc);
    expect(rendered).toContain("A");
    expect(rendered).toContain("1");
  });

  it("renders multi-line table cells", () => {
    doc.splitTextToSize = vi.fn((text: string, _maxWidth: number) => {
      if (text === "A long cell that wraps to multiple lines") {
        return ["A long cell that wraps", "to multiple lines"];
      }
      return [text];
    });

    const md = `| Header | Description |
|---|---|
| Short | A long cell that wraps to multiple lines |`;

    render_tokens_to_pdf(doc, "T", parse(md));
    const rendered = all_text(doc);
    expect(rendered).toContain("A long cell that wraps");
    expect(rendered).toContain("to multiple lines");
  });

  it("renders h1 with underline", () => {
    render_tokens_to_pdf(doc, "T", parse("# Title"));
    expect(doc.line).toHaveBeenCalled();
  });

  it("handles mixed content correctly", () => {
    const md =
      "# Title\n\nParagraph.\n\n## Section\n\n- item\n\n```\ncode\n```";
    render_tokens_to_pdf(doc, "T", parse(md));
    const rendered = all_text(doc);
    expect(rendered).toContain("Title");
    expect(rendered).toContain("Paragraph.");
    expect(rendered).toContain("Section");
    expect(rendered).toContain("item");
    expect(rendered).toContain("code");
  });

  it("adds page when content exceeds page height", () => {
    const long_content = Array.from(
      { length: 100 },
      (_, i) => `Line ${i}`,
    ).join("\n\n");
    render_tokens_to_pdf(doc, "T", parse(long_content));
    expect(doc.addPage).toHaveBeenCalled();
  });

  it("renders mixed inline formatting in paragraphs", () => {
    render_tokens_to_pdf(
      doc,
      "T",
      parse("Normal **bold** then *italic* and `code`"),
    );
    const fonts = font_calls(doc);
    expect(fonts).toContain("Inter:normal");
    expect(fonts).toContain("Inter:bold");
    expect(fonts).toContain("Inter:italic");
    expect(fonts).toContain("courier:normal");
  });

  it("renders inline formatting within headings", () => {
    render_tokens_to_pdf(doc, "T", parse("## Heading with *italic* word"));
    const fonts = font_calls(doc);
    expect(fonts).toContain("Inter:bold");
    expect(fonts).toContain("Inter:bolditalic");
  });

  it("sets courier font before splitTextToSize in code blocks", () => {
    const call_order: string[] = [];
    doc.setFont = vi.fn((...args: unknown[]) => {
      call_order.push(`setFont:${args[0]}`);
    });
    doc.splitTextToSize = vi.fn((text: string) => {
      call_order.push(`splitTextToSize:${text}`);
      return [text];
    });
    render_tokens_to_pdf(doc, "T", parse("```\ncode here\n```"));
    const code_split_idx = call_order.findIndex((c) =>
      c.startsWith("splitTextToSize:code here"),
    );
    const courier_before = call_order
      .slice(0, code_split_idx)
      .lastIndexOf("setFont:courier");
    expect(code_split_idx).toBeGreaterThanOrEqual(0);
    expect(courier_before).toBeGreaterThanOrEqual(0);
  });

  it("sets body font before splitTextToSize in tables", () => {
    const call_order: string[] = [];
    doc.setFont = vi.fn((...args: unknown[]) => {
      doc.calls.push({ method: "setFont", args: [...args] });
      call_order.push(`setFont:${args[0]}:${args[1]}`);
    });
    doc.splitTextToSize = vi.fn((text: string) => {
      call_order.push(`splitTextToSize:${text}`);
      return [text];
    });
    render_tokens_to_pdf(
      doc,
      "T",
      parse("```\ncode\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |"),
    );
    const table_split = call_order.findIndex((c) =>
      c.startsWith("splitTextToSize:A"),
    );
    const body_font_before = call_order
      .slice(0, table_split)
      .lastIndexOf("setFont:Inter:normal");
    expect(body_font_before).toBeGreaterThanOrEqual(0);
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
        getTextWidth: vi.fn(() => 10),
        splitTextToSize: vi.fn((text: string) => [text]),
        line: vi.fn(),
        rect: vi.fn(),
        addPage: vi.fn(),
        addFileToVFS: vi.fn(),
        addFont: vi.fn(),
        output: mock_output,
        internal: { pageSize: { getHeight: () => 297 } },
      })),
    }));

    const ttf_header = new Uint8Array(100);
    ttf_header[0] = 0x00;
    ttf_header[1] = 0x01;
    ttf_header[2] = 0x00;
    ttf_header[3] = 0x00;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(ttf_header.buffer),
      }),
    ) as unknown as typeof fetch;
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

  it("loads Inter fonts via Vite asset URLs", async () => {
    const { export_note_as_pdf: export_fn } =
      await import("$lib/features/document/domain/pdf_export");
    await export_fn("My Note", "Hello");
    const fetch_urls = (
      globalThis.fetch as ReturnType<typeof vi.fn>
    ).mock.calls.map((c: unknown[]) => String(c[0]));
    expect(fetch_urls).toHaveLength(4);
    for (const url of fetch_urls) {
      expect(url).toMatch(/Inter-.+\.ttf/);
    }
  });

  it("throws when font response is not valid TTF", async () => {
    const bad_bytes = new Uint8Array(100);
    bad_bytes[0] = 0x3c; // '<' — HTML
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(bad_bytes.buffer),
      }),
    ) as unknown as typeof fetch;
    const { export_note_as_pdf: export_fn } =
      await import("$lib/features/document/domain/pdf_export");
    await expect(export_fn("My Note", "Hello")).rejects.toThrow(
      /not a valid TTF/i,
    );
  });

  it("throws descriptive error when font fetch fails", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }),
    ) as unknown as typeof fetch;
    const { export_note_as_pdf: export_fn } =
      await import("$lib/features/document/domain/pdf_export");
    await expect(export_fn("My Note", "Hello")).rejects.toThrow(
      /PDF export failed.*font.*Inter-Regular\.ttf.*404/i,
    );
  });
});
