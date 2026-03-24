import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";

const MARGIN = 20;
const PAGE_WIDTH = 210;
const USABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BODY_FONT_SIZE = 11;
const CODE_FONT_SIZE = 9;
const LINE_HEIGHT = 6;
const PARAGRAPH_GAP = 4;
const LIST_INDENT = 8;
const BLOCKQUOTE_INDENT = 8;
const CODE_BLOCK_PADDING = 4;

const HEADING_CONFIG: Record<string, { size: number; spacing: number }> = {
  h1: { size: 20, spacing: 10 },
  h2: { size: 16, spacing: 8 },
  h3: { size: 14, spacing: 6 },
  h4: { size: 12, spacing: 5 },
};

const COLOR_BODY = [36, 41, 47] as const;
const COLOR_MUTED = [87, 96, 106] as const;
const COLOR_BORDER = [208, 215, 222] as const;
const COLOR_CODE_BG = [246, 248, 250] as const;

type JsPDFDoc = {
  text(text: string | string[], x: number, y: number): void;
  setFont(family: string, style: string): void;
  setFontSize(size: number): void;
  setTextColor(r: number, g: number, b: number): void;
  setDrawColor(r: number, g: number, b: number): void;
  setFillColor(r: number, g: number, b: number): void;
  setLineWidth(w: number): void;
  splitTextToSize(text: string, maxWidth: number): string[];
  line(x1: number, y1: number, x2: number, y2: number): void;
  rect(x: number, y: number, w: number, h: number, style: string): void;
  addPage(): void;
  save(filename: string): void;
  internal: { pageSize: { getHeight(): number } };
};

type PdfContext = {
  doc: JsPDFDoc;
  y: number;
  page_height: number;
  indent: number;
};

export function create_md(): MarkdownIt {
  return new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
  }).enable(["table", "strikethrough"]);
}

function extract_inline_text(token: Token): string {
  if (!token.children) return token.content;
  return token.children
    .map((c: Token) => {
      if (c.type === "softbreak") return " ";
      return c.content;
    })
    .join("");
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

function set_body_font(doc: JsPDFDoc): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(BODY_FONT_SIZE);
  doc.setTextColor(...COLOR_BODY);
}

function draw_wrapped_text(
  ctx: PdfContext,
  text: string,
  {
    font_style = "normal",
    font_size = BODY_FONT_SIZE,
    color = COLOR_BODY,
    font_family = "helvetica",
  }: {
    font_style?: string;
    font_size?: number;
    color?: readonly [number, number, number];
    font_family?: string;
  } = {},
): void {
  ctx.doc.setFont(font_family, font_style);
  ctx.doc.setFontSize(font_size);
  ctx.doc.setTextColor(...color);

  const lines = ctx.doc.splitTextToSize(text, usable_width(ctx));
  for (const line of lines) {
    ensure_space(ctx, LINE_HEIGHT);
    ctx.doc.text(line, left_x(ctx), ctx.y);
    ctx.y += LINE_HEIGHT;
  }
}

function render_heading(ctx: PdfContext, tag: string, token: Token): void {
  const config = HEADING_CONFIG[tag] ?? HEADING_CONFIG.h4!;
  ctx.y += config.spacing * 0.6;
  ensure_space(ctx, config.spacing + 2);

  const text = extract_inline_text(token);
  draw_wrapped_text(ctx, text, {
    font_style: "bold",
    font_size: config.size,
  });

  if (tag === "h1") {
    ctx.doc.setDrawColor(...COLOR_BORDER);
    ctx.doc.setLineWidth(0.3);
    ctx.doc.line(
      left_x(ctx),
      ctx.y - 2,
      left_x(ctx) + usable_width(ctx),
      ctx.y - 2,
    );
  }

  ctx.y += config.spacing * 0.4;
}

function render_paragraph(ctx: PdfContext, token: Token): void {
  const text = extract_inline_text(token);
  if (text.trim() === "") return;
  draw_wrapped_text(ctx, text);
  ctx.y += PARAGRAPH_GAP;
}

function render_fence(ctx: PdfContext, token: Token): void {
  const code_text = token.content.trimEnd();
  const lines = ctx.doc.splitTextToSize(
    code_text,
    usable_width(ctx) - CODE_BLOCK_PADDING * 2,
  );
  const block_height =
    lines.length * (LINE_HEIGHT - 1) + CODE_BLOCK_PADDING * 2;

  ensure_space(ctx, block_height);

  ctx.doc.setFillColor(...COLOR_CODE_BG);
  ctx.doc.setDrawColor(...COLOR_BORDER);
  ctx.doc.setLineWidth(0.2);
  ctx.doc.rect(left_x(ctx), ctx.y - 3, usable_width(ctx), block_height, "FD");

  ctx.doc.setFont("courier", "normal");
  ctx.doc.setFontSize(CODE_FONT_SIZE);
  ctx.doc.setTextColor(...COLOR_BODY);

  let code_y = ctx.y + CODE_BLOCK_PADDING;
  for (const line of lines) {
    ctx.doc.text(line, left_x(ctx) + CODE_BLOCK_PADDING, code_y);
    code_y += LINE_HEIGHT - 1;
  }

  ctx.y += block_height + PARAGRAPH_GAP;
  set_body_font(ctx.doc);
}

function render_hr(ctx: PdfContext): void {
  ctx.y += 4;
  ensure_space(ctx, 4);
  ctx.doc.setDrawColor(...COLOR_BORDER);
  ctx.doc.setLineWidth(0.3);
  ctx.doc.line(left_x(ctx), ctx.y, left_x(ctx) + usable_width(ctx), ctx.y);
  ctx.y += 4;
}

function render_table(ctx: PdfContext, tokens: Token[], start: number): number {
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
          }
          i++;
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
  const row_height = LINE_HEIGHT + 4;
  const table_height = rows.length * row_height;

  ensure_space(ctx, Math.min(table_height, ctx.page_height - MARGIN * 2));

  ctx.doc.setDrawColor(...COLOR_BORDER);
  ctx.doc.setLineWidth(0.2);

  for (const row of rows) {
    ensure_space(ctx, row_height);

    if (row.is_header) {
      ctx.doc.setFillColor(...COLOR_CODE_BG);
      ctx.doc.rect(left_x(ctx), ctx.y - 3, usable_width(ctx), row_height, "F");
      ctx.doc.setFont("helvetica", "bold");
    } else {
      ctx.doc.setFont("helvetica", "normal");
    }

    ctx.doc.setFontSize(BODY_FONT_SIZE);
    ctx.doc.setTextColor(...COLOR_BODY);

    for (let c = 0; c < col_count; c++) {
      const cell_x = left_x(ctx) + c * col_width;
      ctx.doc.rect(cell_x, ctx.y - 3, col_width, row_height, "S");
      const cell_text = row.cells[c] ?? "";
      const truncated = ctx.doc.splitTextToSize(cell_text, col_width - 4);
      ctx.doc.text(truncated[0] ?? "", cell_x + 2, ctx.y + 2);
    }

    ctx.y += row_height;
  }

  ctx.y += PARAGRAPH_GAP;
  set_body_font(ctx.doc);
  return i;
}

export function render_tokens_to_pdf(
  doc: JsPDFDoc,
  title: string,
  tokens: Token[],
): void {
  const ctx: PdfContext = {
    doc,
    y: MARGIN,
    page_height: doc.internal.pageSize.getHeight(),
    indent: 0,
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(HEADING_CONFIG.h1!.size);
  doc.setTextColor(...COLOR_BODY);
  const title_lines = doc.splitTextToSize(title, USABLE_WIDTH);
  for (const line of title_lines) {
    doc.text(line, MARGIN, ctx.y);
    ctx.y += 10;
  }

  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, ctx.y - 2, MARGIN + USABLE_WIDTH, ctx.y - 2);
  ctx.y += 6;
  set_body_font(doc);

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
        ordered = false;
        list_item_index = 0;
        ctx.indent += LIST_INDENT;
        break;
      }

      case "ordered_list_open": {
        ordered = true;
        list_item_index = 0;
        ctx.indent += LIST_INDENT;
        break;
      }

      case "bullet_list_close":
      case "ordered_list_close": {
        ctx.indent -= LIST_INDENT;
        ctx.y += PARAGRAPH_GAP;
        break;
      }

      case "list_item_open": {
        list_item_index++;
        const bullet = ordered ? `${list_item_index}.` : "\u2022";
        ensure_space(ctx, LINE_HEIGHT);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(BODY_FONT_SIZE);
        doc.setTextColor(...COLOR_BODY);
        doc.text(bullet, left_x(ctx) - 5, ctx.y);
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

  const { jsPDF } = await import("jspdf");
  const md = create_md();
  const tokens = md.parse(content, {});

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  render_tokens_to_pdf(doc, title, tokens);

  const pdf_bytes = doc.output("arraybuffer");
  await invoke("write_bytes_to_path", {
    path: file_path,
    data: Array.from(new Uint8Array(pdf_bytes)),
  });
}
