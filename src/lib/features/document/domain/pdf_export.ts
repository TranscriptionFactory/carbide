import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import { parse_frontmatter } from "$lib/shared/domain/frontmatter_parser";
import interRegularUrl from "../assets/fonts/Inter-Regular.ttf?url";
import interBoldUrl from "../assets/fonts/Inter-Bold.ttf?url";
import interItalicUrl from "../assets/fonts/Inter-Italic.ttf?url";
import interBoldItalicUrl from "../assets/fonts/Inter-BoldItalic.ttf?url";

const MM = 2.8346;
const MARGIN = 20 * MM;
const PAGE_WIDTH = 210 * MM;
const USABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BODY_FONT_SIZE = 11;
const CODE_FONT_SIZE = 9;
const LINE_HEIGHT = 6 * MM;
const PARAGRAPH_GAP = 4 * MM;
const LIST_INDENT = 8 * MM;
const BLOCKQUOTE_INDENT = 8 * MM;
const CODE_BLOCK_PADDING = 4 * MM;
const FONT_BODY = "Inter";
const FONT_CODE = "Courier";

const HEADING_CONFIG: Record<string, { size: number; spacing: number }> = {
  h1: { size: 20, spacing: 10 * MM },
  h2: { size: 16, spacing: 8 * MM },
  h3: { size: 14, spacing: 6 * MM },
  h4: { size: 12, spacing: 5 * MM },
};

const COLOR_BODY: [number, number, number] = [36, 41, 47];
const COLOR_BORDER: [number, number, number] = [208, 215, 222];
const COLOR_CODE_BG: [number, number, number] = [246, 248, 250];

export type PdfDoc = {
  font(name: string): PdfDoc;
  fontSize(size: number): PdfDoc;
  fillColor(color: string | [number, number, number]): PdfDoc;
  strokeColor(color: string | [number, number, number]): PdfDoc;
  lineWidth(w: number): PdfDoc;
  text(
    str: string,
    x: number,
    y: number,
    options?: { lineBreak?: boolean },
  ): PdfDoc;
  widthOfString(text: string): number;
  rect(x: number, y: number, w: number, h: number): PdfDoc;
  moveTo(x: number, y: number): PdfDoc;
  lineTo(x: number, y: number): PdfDoc;
  fill(color?: string | [number, number, number]): PdfDoc;
  stroke(): PdfDoc;
  fillAndStroke(
    fillColor?: string | [number, number, number],
    strokeColor?: string | [number, number, number],
  ): PdfDoc;
  addPage(): PdfDoc;
  registerFont(name: string, src: ArrayBuffer | Buffer): PdfDoc;
  on(event: string, listener: (...args: any[]) => void): PdfDoc;
  end(): void;
  page: { width: number; height: number };
};

type PdfContext = {
  doc: PdfDoc;
  y: number;
  page_height: number;
  indent: number;
};

export type InlineSpan = {
  text: string;
  bold: boolean;
  italic: boolean;
  code: boolean;
};

export function create_md(): MarkdownIt {
  return new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
  }).enable(["table", "strikethrough"]);
}

export function extract_inline_spans(token: Token): InlineSpan[] {
  if (!token.children) {
    return [{ text: token.content, bold: false, italic: false, code: false }];
  }
  const spans: InlineSpan[] = [];
  let bold = false;
  let italic = false;
  for (const child of token.children) {
    switch (child.type) {
      case "strong_open":
        bold = true;
        break;
      case "strong_close":
        bold = false;
        break;
      case "em_open":
        italic = true;
        break;
      case "em_close":
        italic = false;
        break;
      case "code_inline":
        spans.push({
          text: child.content,
          bold: false,
          italic: false,
          code: true,
        });
        break;
      case "softbreak":
        spans.push({ text: " ", bold, italic, code: false });
        break;
      default:
        if (child.content) {
          spans.push({ text: child.content, bold, italic, code: false });
        }
        break;
    }
  }
  return spans;
}

function extract_inline_text(token: Token): string {
  return extract_inline_spans(token)
    .map((s) => s.text)
    .join("");
}

export function split_text_to_width(
  doc: PdfDoc,
  text: string,
  max_width: number,
): string[] {
  const result: string[] = [];
  for (const raw_line of text.split("\n")) {
    if (doc.widthOfString(raw_line) <= max_width) {
      result.push(raw_line);
      continue;
    }
    let current = "";
    for (const ch of raw_line) {
      const candidate = current + ch;
      if (doc.widthOfString(candidate) > max_width && current.length > 0) {
        result.push(current);
        current = ch;
      } else {
        current = candidate;
      }
    }
    if (current.length > 0) result.push(current);
  }
  return result;
}

function usable_width(ctx: PdfContext): number {
  return USABLE_WIDTH - ctx.indent;
}

function left_x(ctx: PdfContext): number {
  return MARGIN + ctx.indent;
}

function ensure_space(ctx: PdfContext, needed: number): void {
  if (ctx.y + needed > ctx.page_height - MARGIN) {
    ctx.doc.addPage();
    ctx.y = MARGIN;
  }
}

function set_body_font(doc: PdfDoc): void {
  doc.font(`${FONT_BODY}-normal`);
  doc.fontSize(BODY_FONT_SIZE);
  doc.fillColor(COLOR_BODY);
}

function apply_span_font(
  doc: PdfDoc,
  span: InlineSpan,
  base_size: number,
  base_bold: boolean,
): void {
  if (span.code) {
    doc.font(FONT_CODE);
    doc.fontSize(CODE_FONT_SIZE);
  } else {
    const bold = span.bold || base_bold;
    const style =
      bold && span.italic
        ? "bolditalic"
        : bold
          ? "bold"
          : span.italic
            ? "italic"
            : "normal";
    doc.font(`${FONT_BODY}-${style}`);
    doc.fontSize(base_size);
  }
}

function render_inline_spans(
  ctx: PdfContext,
  spans: InlineSpan[],
  {
    font_size = BODY_FONT_SIZE,
    color = COLOR_BODY,
    base_bold = false,
  }: {
    font_size?: number;
    color?: readonly [number, number, number];
    base_bold?: boolean;
  } = {},
): void {
  const words: { text: string; span: InlineSpan }[] = [];
  for (const span of spans) {
    for (const part of span.text.split(/( +)/)) {
      if (part.length > 0) words.push({ text: part, span });
    }
  }
  if (words.length === 0) return;

  let x = left_x(ctx);
  const max_x = left_x(ctx) + usable_width(ctx);
  let line_has_content = false;

  ensure_space(ctx, LINE_HEIGHT);
  ctx.doc.fillColor([...color] as [number, number, number]);

  for (const { text, span } of words) {
    apply_span_font(ctx.doc, span, font_size, base_bold);
    const w = ctx.doc.widthOfString(text);
    const is_space = text.trim() === "";

    if (line_has_content && !is_space && x + w > max_x) {
      ctx.y += LINE_HEIGHT;
      ensure_space(ctx, LINE_HEIGHT);
      x = left_x(ctx);
      line_has_content = false;
    }

    if (!line_has_content && is_space) continue;

    ctx.doc.text(text, x, ctx.y, { lineBreak: false });
    x += w;
    if (!is_space) line_has_content = true;
  }

  ctx.y += LINE_HEIGHT;
}

function render_heading(ctx: PdfContext, tag: string, token: Token): void {
  const config = HEADING_CONFIG[tag] ?? HEADING_CONFIG.h4!;
  ctx.y += config.spacing * 0.6;
  ensure_space(ctx, config.spacing + 2);

  const spans = extract_inline_spans(token);
  render_inline_spans(ctx, spans, {
    font_size: config.size,
    base_bold: true,
  });

  if (tag === "h1") {
    ctx.doc.strokeColor(COLOR_BORDER);
    ctx.doc.lineWidth(0.3 * MM);
    ctx.doc
      .moveTo(left_x(ctx), ctx.y - 2 * MM)
      .lineTo(left_x(ctx) + usable_width(ctx), ctx.y - 2 * MM)
      .stroke();
  }

  ctx.y += config.spacing * 0.4;
}

function render_paragraph(ctx: PdfContext, token: Token): void {
  const spans = extract_inline_spans(token);
  if (spans.every((s) => s.text.trim() === "")) return;
  render_inline_spans(ctx, spans);
  ctx.y += PARAGRAPH_GAP;
}

function render_fence(ctx: PdfContext, token: Token): void {
  const code_text = token.content.trimEnd();
  ctx.doc.font(FONT_CODE);
  ctx.doc.fontSize(CODE_FONT_SIZE);
  const lines = split_text_to_width(
    ctx.doc,
    code_text,
    usable_width(ctx) - CODE_BLOCK_PADDING * 2,
  );
  const block_height =
    lines.length * (LINE_HEIGHT - 1 * MM) + CODE_BLOCK_PADDING * 2;

  ensure_space(ctx, block_height);

  ctx.doc.lineWidth(0.2 * MM);
  ctx.doc
    .rect(left_x(ctx), ctx.y - 3 * MM, usable_width(ctx), block_height)
    .fillAndStroke(COLOR_CODE_BG, COLOR_BORDER);

  ctx.doc.fillColor(COLOR_BODY);

  let code_y = ctx.y + CODE_BLOCK_PADDING;
  for (const line of lines) {
    ctx.doc.font(FONT_CODE);
    ctx.doc.fontSize(CODE_FONT_SIZE);
    ctx.doc.text(line, left_x(ctx) + CODE_BLOCK_PADDING, code_y, {
      lineBreak: false,
    });
    code_y += LINE_HEIGHT - 1 * MM;
  }

  ctx.y += block_height + PARAGRAPH_GAP;
  set_body_font(ctx.doc);
}

function render_hr(ctx: PdfContext): void {
  ctx.y += 4 * MM;
  ensure_space(ctx, 4 * MM);
  ctx.doc.strokeColor(COLOR_BORDER);
  ctx.doc.lineWidth(0.3 * MM);
  ctx.doc
    .moveTo(left_x(ctx), ctx.y)
    .lineTo(left_x(ctx) + usable_width(ctx), ctx.y)
    .stroke();
  ctx.y += 4 * MM;
}

function render_table(ctx: PdfContext, tokens: Token[], start: number): number {
  set_body_font(ctx.doc);
  const rows: { cells: string[]; is_header: boolean }[] = [];
  let i = start + 1;
  let in_header = false;

  while (i < tokens.length && tokens[i]!.type !== "table_close") {
    const t = tokens[i]!;
    if (t.type === "thead_open") in_header = true;
    else if (t.type === "thead_close") in_header = false;
    else if (t.type === "tr_open") {
      const cells: string[] = [];
      i++;
      while (i < tokens.length && tokens[i]!.type !== "tr_close") {
        const cell = tokens[i]!;
        if (cell.type === "th_open" || cell.type === "td_open") {
          i++;
          if (i < tokens.length && tokens[i]!.type === "inline") {
            cells.push(extract_inline_text(tokens[i]!));
            i++;
          }
          if (
            i < tokens.length &&
            (tokens[i]!.type === "th_close" || tokens[i]!.type === "td_close")
          ) {
            i++;
          }
          continue;
        }
        i++;
      }
      rows.push({ cells, is_header: in_header });
    }
    i++;
  }

  if (rows.length === 0) return i;

  const col_count = Math.max(...rows.map((r) => r.cells.length));
  const col_width = usable_width(ctx) / col_count;

  ctx.doc.strokeColor(COLOR_BORDER);
  ctx.doc.lineWidth(0.2 * MM);

  for (const row of rows) {
    const wrapped = Array.from({ length: col_count }, (_, c) => {
      const text = row.cells[c] ?? "";
      return split_text_to_width(ctx.doc, text, col_width - 4 * MM);
    });
    const max_lines = Math.max(1, ...wrapped.map((l) => l.length));
    const row_h = max_lines * (LINE_HEIGHT - 1 * MM) + 5 * MM;

    ensure_space(ctx, row_h);

    if (row.is_header) {
      ctx.doc
        .rect(left_x(ctx), ctx.y - 3 * MM, usable_width(ctx), row_h)
        .fill(COLOR_CODE_BG);
      ctx.doc.font(`${FONT_BODY}-bold`);
    } else {
      ctx.doc.font(`${FONT_BODY}-normal`);
    }

    ctx.doc.fontSize(BODY_FONT_SIZE);
    ctx.doc.fillColor(COLOR_BODY);

    for (let c = 0; c < col_count; c++) {
      const cell_x = left_x(ctx) + c * col_width;
      ctx.doc.rect(cell_x, ctx.y - 3 * MM, col_width, row_h).stroke();
      const cell_lines = wrapped[c] ?? [];
      let cell_y = ctx.y + 2 * MM;
      for (const line of cell_lines) {
        ctx.doc.text(line, cell_x + 2 * MM, cell_y, { lineBreak: false });
        cell_y += LINE_HEIGHT - 1 * MM;
      }
    }

    ctx.y += row_h;
  }

  ctx.y += PARAGRAPH_GAP;
  set_body_font(ctx.doc);
  return i;
}

export function render_tokens_to_pdf(
  doc: PdfDoc,
  title: string,
  tokens: Token[],
): void {
  const ctx: PdfContext = {
    doc,
    y: MARGIN,
    page_height: doc.page.height,
    indent: 0,
  };

  doc.font(`${FONT_BODY}-bold`);
  doc.fontSize(HEADING_CONFIG.h1!.size);
  doc.fillColor(COLOR_BODY);
  const title_lines = split_text_to_width(doc, title, USABLE_WIDTH);
  for (const line of title_lines) {
    doc.text(line, MARGIN, ctx.y, { lineBreak: false });
    ctx.y += 10 * MM;
  }

  doc.strokeColor(COLOR_BORDER);
  doc.lineWidth(0.3 * MM);
  doc
    .moveTo(MARGIN, ctx.y - 2 * MM)
    .lineTo(MARGIN + USABLE_WIDTH, ctx.y - 2 * MM)
    .stroke();
  ctx.y += 6 * MM;
  set_body_font(doc);

  const list_stack: { index: number; ordered: boolean }[] = [];
  let list_item_index = 0;
  let ordered = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;

    switch (token.type) {
      case "heading_open": {
        i++;
        if (i < tokens.length && tokens[i]!.type === "inline") {
          render_heading(ctx, token.tag, tokens[i]!);
        }
        i++;
        break;
      }

      case "paragraph_open": {
        i++;
        if (i < tokens.length && tokens[i]!.type === "inline") {
          render_paragraph(ctx, tokens[i]!);
        }
        i++;
        break;
      }

      case "fence": {
        render_fence(ctx, token);
        break;
      }

      case "code_block": {
        render_fence(ctx, token);
        break;
      }

      case "hr": {
        render_hr(ctx);
        break;
      }

      case "bullet_list_open": {
        list_stack.push({ index: list_item_index, ordered });
        ordered = false;
        list_item_index = 0;
        ctx.indent += LIST_INDENT;
        break;
      }

      case "ordered_list_open": {
        list_stack.push({ index: list_item_index, ordered });
        ordered = true;
        list_item_index = 0;
        ctx.indent += LIST_INDENT;
        break;
      }

      case "bullet_list_close":
      case "ordered_list_close": {
        ctx.indent -= LIST_INDENT;
        ctx.y += PARAGRAPH_GAP;
        const parent = list_stack.pop();
        if (parent) {
          list_item_index = parent.index;
          ordered = parent.ordered;
        }
        break;
      }

      case "list_item_open": {
        list_item_index++;
        const bullet = ordered ? `${list_item_index}.` : "\u2022";
        ensure_space(ctx, LINE_HEIGHT);
        doc.font(`${FONT_BODY}-normal`);
        doc.fontSize(BODY_FONT_SIZE);
        doc.fillColor(COLOR_BODY);
        doc.text(bullet, left_x(ctx) - 5 * MM, ctx.y, { lineBreak: false });
        break;
      }

      case "blockquote_open": {
        ctx.indent += BLOCKQUOTE_INDENT;
        break;
      }

      case "blockquote_close": {
        ctx.indent -= BLOCKQUOTE_INDENT;
        ctx.y += PARAGRAPH_GAP;
        break;
      }

      case "table_open": {
        i = render_table(ctx, tokens, i);
        break;
      }

      default:
        break;
    }
  }
}

const TTF_MAGIC = new Uint8Array([0x00, 0x01, 0x00, 0x00]);

const FONT_FILES = [
  { file: "Inter-Regular.ttf", url: interRegularUrl, style: "normal" },
  { file: "Inter-Bold.ttf", url: interBoldUrl, style: "bold" },
  { file: "Inter-Italic.ttf", url: interItalicUrl, style: "italic" },
  {
    file: "Inter-BoldItalic.ttf",
    url: interBoldItalicUrl,
    style: "bolditalic",
  },
] as const;

async function load_fonts(doc: PdfDoc): Promise<void> {
  for (const { file, url, style } of FONT_FILES) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Failed to load font ${file}: ${res.status} ${res.statusText}`,
      );
    }
    const buf = await res.arrayBuffer();
    const header = new Uint8Array(buf, 0, 4);
    if (!header.every((b, i) => b === TTF_MAGIC[i])) {
      throw new Error(
        `Font ${file} is not a valid TTF (bad magic bytes). The asset URL may be misconfigured.`,
      );
    }
    doc.registerFont(`${FONT_BODY}-${style}`, buf);
  }
}

export async function export_note_as_pdf(
  title: string,
  content: string,
): Promise<void> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");

  const file_path = await save({
    title: "Export as PDF",
    defaultPath: `${title}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (!file_path) return;

  try {
    const pdfkitModule = await import("pdfkit");
    const PDFDocument = pdfkitModule.default || pdfkitModule;

    const md = create_md();
    const body = parse_frontmatter(content).body;
    const tokens = md.parse(body, {});

    const doc: PdfDoc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    });

    const chunks: Uint8Array[] = [];
    const pdf_bytes = new Promise<Uint8Array>((resolve, reject) => {
      doc.on("data", (chunk: Buffer | Uint8Array) => {
        chunks.push(
          chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk),
        );
      });
      doc.on("end", () => {
        let total = 0;
        for (const c of chunks) total += c.length;
        const result = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          result.set(c, offset);
          offset += c.length;
        }
        resolve(result);
      });
      doc.on("error", reject);
    });

    await load_fonts(doc);
    render_tokens_to_pdf(doc, title, tokens);
    doc.end();

    await invoke("write_bytes_to_path", {
      path: file_path,
      data: Array.from(await pdf_bytes),
    });
  } catch (err) {
    throw new Error(
      `PDF export failed for "${title}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
