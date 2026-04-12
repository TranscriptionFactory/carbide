// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  create_md,
  render_tokens_to_pdf,
  extract_inline_spans,
  split_text_to_width,
  export_note_as_pdf,
} from "$lib/features/document/domain/pdf_export";
import type { PdfDoc } from "$lib/features/document/domain/pdf_export";
import { parse_frontmatter } from "$lib/shared/domain/frontmatter_parser";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

function create_mock_doc(): PdfDoc & {
  calls: { method: string; args: unknown[] }[];
  text: ReturnType<typeof vi.fn>;
  font: ReturnType<typeof vi.fn>;
  fontSize: ReturnType<typeof vi.fn>;
  fillColor: ReturnType<typeof vi.fn>;
  strokeColor: ReturnType<typeof vi.fn>;
  lineWidth: ReturnType<typeof vi.fn>;
  widthOfString: ReturnType<typeof vi.fn>;
  rect: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
  fillAndStroke: ReturnType<typeof vi.fn>;
  addPage: ReturnType<typeof vi.fn>;
  registerFont: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
} {
  const calls: { method: string; args: unknown[] }[] = [];
  const self = {} as ReturnType<typeof create_mock_doc>;

  self.calls = calls;
  self.text = vi.fn((...args: unknown[]) => {
    calls.push({ method: "text", args });
    return self;
  });
  self.font = vi.fn((...args: unknown[]) => {
    calls.push({ method: "font", args });
    return self;
  });
  self.fontSize = vi.fn((...args: unknown[]) => {
    calls.push({ method: "fontSize", args });
    return self;
  });
  self.fillColor = vi.fn((...args: unknown[]) => {
    calls.push({ method: "fillColor", args });
    return self;
  });
  self.strokeColor = vi.fn((...args: unknown[]) => {
    calls.push({ method: "strokeColor", args });
    return self;
  });
  self.lineWidth = vi.fn((...args: unknown[]) => {
    calls.push({ method: "lineWidth", args });
    return self;
  });
  self.widthOfString = vi.fn((text: string) => text.length * 1.5);
  self.rect = vi.fn((...args: unknown[]) => {
    calls.push({ method: "rect", args });
    return self;
  });
  self.moveTo = vi.fn((...args: unknown[]) => {
    calls.push({ method: "moveTo", args });
    return self;
  });
  self.lineTo = vi.fn((...args: unknown[]) => {
    calls.push({ method: "lineTo", args });
    return self;
  });
  self.fill = vi.fn((...args: unknown[]) => {
    calls.push({ method: "fill", args });
    return self;
  });
  self.stroke = vi.fn((...args: unknown[]) => {
    calls.push({ method: "stroke", args });
    return self;
  });
  self.fillAndStroke = vi.fn((...args: unknown[]) => {
    calls.push({ method: "fillAndStroke", args });
    return self;
  });
  self.addPage = vi.fn(() => {
    calls.push({ method: "addPage", args: [] });
    return self;
  });
  self.registerFont = vi.fn();
  self.on = vi.fn(() => self);
  self.end = vi.fn();
  self.page = { width: A4_WIDTH, height: A4_HEIGHT };

  return self;
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
  return doc.font.mock.calls.map((c: unknown[]) => String(c[0]));
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

describe("split_text_to_width", () => {
  let doc: ReturnType<typeof create_mock_doc>;

  beforeEach(() => {
    doc = create_mock_doc();
  });

  it("returns single line when text fits", () => {
    const result = split_text_to_width(doc, "short", 100);
    expect(result).toEqual(["short"]);
  });

  it("wraps long line at character boundary", () => {
    doc.widthOfString = vi.fn((text: string) => text.length * 10);
    const result = split_text_to_width(doc, "abcdef", 35);
    expect(result.length).toBeGreaterThan(1);
    expect(result.join("")).toBe("abcdef");
  });

  it("splits multi-line input by newlines", () => {
    const result = split_text_to_width(doc, "line1\nline2\nline3", 1000);
    expect(result).toEqual(["line1", "line2", "line3"]);
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
    expect(doc.font).toHaveBeenCalledWith("Inter-bold");
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
    expect(font_calls(doc)).toContain("Inter-bold");
  });

  it("renders italic text with italic font", () => {
    render_tokens_to_pdf(doc, "T", parse("This is *italic* text"));
    expect(all_text(doc)).toContain("italic");
    expect(font_calls(doc)).toContain("Inter-italic");
  });

  it("renders bold+italic with bolditalic font", () => {
    render_tokens_to_pdf(doc, "T", parse("***both***"));
    expect(all_text(doc)).toContain("both");
    expect(font_calls(doc)).toContain("Inter-bolditalic");
  });

  it("renders inline code with Courier font", () => {
    render_tokens_to_pdf(doc, "T", parse("use `myFunc()` here"));
    expect(all_text(doc)).toContain("myFunc()");
    expect(doc.font).toHaveBeenCalledWith("Courier");
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

  it("renders code blocks with Courier font", () => {
    render_tokens_to_pdf(doc, "T", parse("```\nconst x = 1;\n```"));
    expect(doc.font).toHaveBeenCalledWith("Courier");
    expect(all_text(doc)).toContain("const x = 1;");
  });

  it("renders code blocks with background rect", () => {
    render_tokens_to_pdf(doc, "T", parse("```\ncode\n```"));
    expect(doc.rect).toHaveBeenCalled();
    expect(doc.fillAndStroke).toHaveBeenCalledWith(
      [246, 248, 250],
      [208, 215, 222],
    );
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

  it("renders nested lists with correct numbering after sub-list", () => {
    const md = "1. first\n   - sub a\n   - sub b\n2. second";
    render_tokens_to_pdf(doc, "T", parse(md));
    const texts = text_calls(doc);
    expect(texts).toContain("1.");
    expect(texts).toContain("\u2022");
    expect(texts).toContain("2.");
  });

  it("renders horizontal rule via moveTo/lineTo/stroke", () => {
    render_tokens_to_pdf(doc, "T", parse("---"));
    const methods = doc.calls.map((c) => c.method);
    const last_move = methods.lastIndexOf("moveTo");
    expect(last_move).toBeGreaterThanOrEqual(0);
    expect(methods[last_move + 1]).toBe("lineTo");
    expect(methods[last_move + 2]).toBe("stroke");
  });

  it("renders tables with rect cells", () => {
    render_tokens_to_pdf(doc, "T", parse("| A | B |\n|---|---|\n| 1 | 2 |"));
    expect(doc.rect).toHaveBeenCalled();
    const rendered = all_text(doc);
    expect(rendered).toContain("A");
    expect(rendered).toContain("1");
  });

  it("renders multi-line table cells", () => {
    doc.widthOfString = vi.fn((text: string) => {
      if (text === "A long cell that wraps to multiple lines") return 9999;
      return text.length * 1.5;
    });

    const md = `| Header | Description |
|---|---|
| Short | A long cell that wraps to multiple lines |`;

    render_tokens_to_pdf(doc, "T", parse(md));
    const rendered = all_text(doc);
    expect(rendered).toContain("A long cell that wraps to multiple lines");
  });

  it("renders h1 with underline via moveTo/lineTo/stroke", () => {
    render_tokens_to_pdf(doc, "T", parse("# Title"));
    expect(doc.moveTo).toHaveBeenCalled();
    expect(doc.lineTo).toHaveBeenCalled();
    expect(doc.stroke).toHaveBeenCalled();
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
    expect(fonts).toContain("Inter-normal");
    expect(fonts).toContain("Inter-bold");
    expect(fonts).toContain("Inter-italic");
    expect(fonts).toContain("Courier");
  });

  it("renders inline formatting within headings", () => {
    render_tokens_to_pdf(doc, "T", parse("## Heading with *italic* word"));
    const fonts = font_calls(doc);
    expect(fonts).toContain("Inter-bold");
    expect(fonts).toContain("Inter-bolditalic");
  });

  it("sets Courier font before split_text_to_width in code blocks", () => {
    const call_order: string[] = [];
    doc.font = vi.fn((...args: unknown[]) => {
      call_order.push(`font:${args[0]}`);
      return doc;
    });
    doc.widthOfString = vi.fn((text: string) => {
      call_order.push(`widthOfString:${text.slice(0, 20)}`);
      return text.length * 1.5;
    });
    render_tokens_to_pdf(doc, "T", parse("```\ncode here\n```"));
    const code_width_idx = call_order.findIndex((c) =>
      c.startsWith("widthOfString:code here"),
    );
    const courier_before = call_order
      .slice(0, code_width_idx)
      .lastIndexOf("font:Courier");
    expect(code_width_idx).toBeGreaterThanOrEqual(0);
    expect(courier_before).toBeGreaterThanOrEqual(0);
  });

  it("sets body font before split_text_to_width in tables", () => {
    const call_order: string[] = [];
    doc.font = vi.fn((...args: unknown[]) => {
      doc.calls.push({ method: "font", args: [...args] });
      call_order.push(`font:${args[0]}`);
      return doc;
    });
    doc.widthOfString = vi.fn((text: string) => {
      call_order.push(`widthOfString:${text}`);
      return text.length * 1.5;
    });
    render_tokens_to_pdf(
      doc,
      "T",
      parse("```\ncode\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |"),
    );
    const table_width = call_order.findIndex((c) =>
      c.startsWith("widthOfString:A"),
    );
    const body_font_before = call_order
      .slice(0, table_width)
      .lastIndexOf("font:Inter-normal");
    expect(body_font_before).toBeGreaterThanOrEqual(0);
  });
});

describe("frontmatter stripping", () => {
  it("does not render frontmatter fields as body text", () => {
    const doc = create_mock_doc();
    const content =
      '---\ntitle: "My Note"\ndate_created: 2024-01-01\n---\n\nActual body text.';
    const { body } = parse_frontmatter(content);
    const tokens = parse(body);
    render_tokens_to_pdf(doc, "My Note", tokens);
    const rendered = all_text(doc);
    expect(rendered).toContain("Actual body text.");
    expect(rendered).not.toContain("date_created");
    expect(rendered).not.toContain("2024-01-01");
  });

  it("handles content without frontmatter unchanged", () => {
    const doc = create_mock_doc();
    const content = "Just a paragraph.";
    const { body } = parse_frontmatter(content);
    const tokens = parse(body);
    render_tokens_to_pdf(doc, "Note", tokens);
    expect(all_text(doc)).toContain("Just a paragraph.");
  });
});

describe("export_note_as_pdf", () => {
  const mock_invoke = vi.fn();
  const mock_dialog_save = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mock_dialog_save.mockResolvedValue("/tmp/test.pdf");

    vi.doMock("@tauri-apps/plugin-dialog", () => ({
      save: mock_dialog_save,
    }));

    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: mock_invoke,
    }));

    vi.doMock("pdfkit", () => {
      const make_doc = vi.fn(() => {
        const listeners: Record<string, Function[]> = {};
        const doc_instance = {
          font: vi.fn().mockReturnThis(),
          fontSize: vi.fn().mockReturnThis(),
          fillColor: vi.fn().mockReturnThis(),
          strokeColor: vi.fn().mockReturnThis(),
          lineWidth: vi.fn().mockReturnThis(),
          text: vi.fn().mockReturnThis(),
          widthOfString: vi.fn(() => 10),
          rect: vi.fn().mockReturnThis(),
          moveTo: vi.fn().mockReturnThis(),
          lineTo: vi.fn().mockReturnThis(),
          fill: vi.fn().mockReturnThis(),
          stroke: vi.fn().mockReturnThis(),
          fillAndStroke: vi.fn().mockReturnThis(),
          addPage: vi.fn().mockReturnThis(),
          registerFont: vi.fn(),
          on: vi.fn((event: string, cb: Function) => {
            (listeners[event] ??= []).push(cb);
            return doc_instance;
          }),
          end: vi.fn(() => {
            for (const cb of listeners["data"] ?? [])
              cb(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
            for (const cb of listeners["end"] ?? []) cb();
          }),
          page: { width: 595.28, height: 841.89 },
        };
        return doc_instance;
      });
      return { default: make_doc };
    });

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

  it("calls registerFont instead of addFileToVFS/addFont", async () => {
    const { export_note_as_pdf: export_fn } =
      await import("$lib/features/document/domain/pdf_export");
    await export_fn("My Note", "Hello");

    const PDFDocument = (await import("pdfkit")).default;
    const doc_instance = (PDFDocument as unknown as ReturnType<typeof vi.fn>)
      .mock.results[0]?.value;
    expect(doc_instance.registerFont).toHaveBeenCalledTimes(4);
    expect(doc_instance.registerFont).toHaveBeenCalledWith(
      "Inter-normal",
      expect.any(ArrayBuffer),
    );
    expect(doc_instance.registerFont).toHaveBeenCalledWith(
      "Inter-bold",
      expect.any(ArrayBuffer),
    );
  });
});
