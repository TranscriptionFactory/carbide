const LINE_HEIGHT = 7;
const MARGIN = 20;
const PAGE_WIDTH = 210;
const USABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;

type HeadingLevel = 1 | 2 | 3;

type Block =
  | { kind: "heading"; level: HeadingLevel; text: string }
  | { kind: "text"; text: string };

function parse_blocks(markdown: string): Block[] {
  const lines = markdown.split("\n");
  const blocks: Block[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h3 = line.match(/^###\s+(.*)/);
    if (h3) {
      blocks.push({ kind: "heading", level: 3, text: h3[1] ?? "" });
      continue;
    }
    const h2 = line.match(/^##\s+(.*)/);
    if (h2) {
      blocks.push({ kind: "heading", level: 2, text: h2[1] ?? "" });
      continue;
    }
    const h1 = line.match(/^#\s+(.*)/);
    if (h1) {
      blocks.push({ kind: "heading", level: 1, text: h1[1] ?? "" });
      continue;
    }
    const stripped = line
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .replace(/~~(.+?)~~/g, "$1");
    blocks.push({ kind: "text", text: stripped });
  }

  return blocks;
}

function heading_font_size(level: HeadingLevel): number {
  if (level === 1) return 20;
  if (level === 2) return 16;
  return 13;
}

export async function export_note_as_pdf(
  title: string,
  content: string,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const blocks = parse_blocks(content);

  let y = MARGIN;

  function ensure_space(needed: number) {
    const page_height = doc.internal.pageSize.getHeight();
    if (y + needed > page_height - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  }

  for (const block of blocks) {
    if (block.kind === "heading") {
      const size = heading_font_size(block.level);
      doc.setFontSize(size);
      doc.setFont("helvetica", "bold");
      const line_h = size * 0.3528 * 1.4;
      ensure_space(line_h + 2);
      doc.text(block.text, MARGIN, y);
      y += line_h + 2;
    } else {
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      if (block.text.trim() === "") {
        y += LINE_HEIGHT * 0.5;
        continue;
      }
      const lines = doc.splitTextToSize(block.text, USABLE_WIDTH) as string[];
      for (const line of lines) {
        ensure_space(LINE_HEIGHT);
        doc.text(line, MARGIN, y);
        y += LINE_HEIGHT;
      }
    }
  }

  doc.save(`${title}.pdf`);
}
