import MarkdownIt from "markdown-it";

const PDF_STYLES = `
h1 { font-size: 24px; margin: 0 0 16px 0; padding-bottom: 8px; border-bottom: 1px solid #d0d7de; font-weight: bold; }
h2 { font-size: 20px; margin: 20px 0 12px 0; font-weight: bold; }
h3 { font-size: 16px; margin: 16px 0 8px 0; font-weight: bold; }
h4 { font-size: 14px; margin: 12px 0 6px 0; font-weight: bold; }
p { margin: 0 0 12px 0; line-height: 1.6; }
strong { font-weight: bold; }
em { font-style: italic; }
code { background: #f6f8fa; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 0.875em; }
s { text-decoration: line-through; color: #57606a; }
a { color: #0969da; text-decoration: none; }
pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; font-family: monospace; font-size: 12px; line-height: 1.45; margin: 0 0 16px 0; }
pre code { background: none; padding: 0; }
blockquote { border-left: 4px solid #d0d7de; padding-left: 16px; margin: 0 0 16px 0; color: #57606a; }
ul, ol { padding-left: 24px; margin: 0 0 16px 0; }
li { margin: 4px 0; }
table { border-collapse: collapse; width: 100%; margin: 0 0 16px 0; }
th, td { border: 1px solid #d0d7de; padding: 8px 12px; text-align: left; }
th { background: #f6f8fa; font-weight: bold; }
hr { border: none; border-top: 1px solid #d0d7de; margin: 24px 0; }
img { max-width: 100%; height: auto; }
`;

function create_md(): MarkdownIt {
  return new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
  }).enable(["table", "strikethrough"]);
}

function escape_html(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function create_export_container(title: string, html: string): HTMLDivElement {
  const container = document.createElement("div");
  container.id = "pdf-export-container";
  container.style.cssText = `
    position: absolute;
    left: -9999px;
    top: 0;
    width: 800px;
    padding: 40px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #24292f;
    background: #ffffff;
    isolation: isolate;
  `;

  const shadow = container.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = PDF_STYLES;
  shadow.appendChild(style);

  const wrapper = document.createElement("div");
  wrapper.className = "markdown-body";

  const titleEl = document.createElement("h1");
  titleEl.textContent = title;
  wrapper.appendChild(titleEl);

  const content = document.createElement("div");
  content.innerHTML = html;
  wrapper.appendChild(content);

  shadow.appendChild(wrapper);

  document.body.appendChild(container);
  return container;
}

async function fallback_text_export(
  title: string,
  content: string,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const MARGIN = 20;
  const PAGE_WIDTH = 210;
  const USABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;
  let y = MARGIN;

  function ensure_space(needed: number): void {
    const page_height = doc.internal.pageSize.getHeight();
    if (y + needed > page_height - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  }

  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text(title, MARGIN, y);
  y += 12;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");

  const lines = content.split("\n");
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("# ")) {
      ensure_space(10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text(line.substring(2), MARGIN, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      y += 10;
    } else if (line.startsWith("## ")) {
      ensure_space(8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(line.substring(3), MARGIN, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      y += 8;
    } else if (line.startsWith("### ")) {
      ensure_space(6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(line.substring(4), MARGIN, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      y += 6;
    } else if (line.trim() === "") {
      y += 4;
    } else {
      const stripped = line
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/`(.+?)`/g, "$1")
        .replace(/~~(.+?)~~/g, "$1");
      const split_lines = doc.splitTextToSize(
        stripped,
        USABLE_WIDTH,
      ) as string[];
      for (const split_line of split_lines) {
        ensure_space(7);
        doc.text(split_line, MARGIN, y);
        y += 7;
      }
    }
  }

  doc.save(`${escape_html(title)}.pdf`);
}

export async function export_note_as_pdf(
  title: string,
  content: string,
): Promise<void> {
  try {
    const { jsPDF } = await import("jspdf");

    const md = create_md();
    const html = md.render(content);

    const container = create_export_container(title, html);

    try {
      const doc = new jsPDF({
        unit: "mm",
        format: "a4",
        orientation: "portrait",
      });

      await doc.html(container, {
        width: 170,
        windowWidth: 800,
        callback: (doc) => {
          doc.save(`${escape_html(title)}.pdf`);
        },
      });
    } finally {
      container.remove();
    }
  } catch (error) {
    console.error(
      "PDF HTML export failed, falling back to text export:",
      error,
    );
    await fallback_text_export(title, content);
  }
}
