import MarkdownIt from "markdown-it";

const PDF_STYLES = `
h1 { font-size: 24px; margin: 0 0 16px 0; padding-bottom: 8px; border-bottom: 1px solid #d0d7de; }
h2 { font-size: 20px; margin: 20px 0 12px 0; font-weight: 600; }
h3 { font-size: 16px; margin: 16px 0 8px 0; font-weight: 600; }
h4 { font-size: 14px; margin: 12px 0 6px 0; font-weight: 600; }
p { margin: 0 0 12px 0; line-height: 1.6; }
strong { font-weight: 600; }
em { font-style: italic; }
code { background: #f6f8fa; padding: 2px 6px; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.875em; }
del { text-decoration: line-through; color: #57606a; }
a { color: #0969da; text-decoration: none; }
pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.45; margin: 0 0 16px 0; }
pre code { background: none; padding: 0; }
blockquote { border-left: 4px solid #d0d7de; padding-left: 16px; margin: 0 0 16px 0; color: #57606a; }
ul, ol { padding-left: 24px; margin: 0 0 16px 0; }
li { margin: 4px 0; }
table { border-collapse: collapse; width: 100%; margin: 0 0 16px 0; }
th, td { border: 1px solid #d0d7de; padding: 8px 12px; text-align: left; }
th { background: #f6f8fa; font-weight: 600; }
hr { border: none; border-top: 1px solid #d0d7de; margin: 24px 0; }
img { max-width: 100%; height: auto; }
.task-list-item { list-style: none; margin-left: -24px; }
.task-list-item input { margin-right: 8px; }
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

function render_code_blocks(html: string): string {
  return html.replace(
    /<pre><code(?: class="language-(\w+)")?>/g,
    (_match, lang) => {
      const langAttr = lang ? ` class="language-${lang}"` : "";
      return `<pre><code${langAttr}>`;
    },
  );
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
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #24292f;
    background: #ffffff;
  `;

  const style = document.createElement("style");
  style.textContent = PDF_STYLES;
  container.appendChild(style);

  const titleEl = document.createElement("h1");
  titleEl.textContent = title;
  container.appendChild(titleEl);

  const content = document.createElement("div");
  content.className = "markdown-body";
  content.innerHTML = render_code_blocks(html);
  container.appendChild(content);

  document.body.appendChild(container);
  return container;
}

export async function export_note_as_pdf(
  title: string,
  content: string,
): Promise<void> {
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
}
