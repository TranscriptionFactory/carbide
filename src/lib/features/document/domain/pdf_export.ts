import MarkdownIt from "markdown-it";

const PRINT_STYLES = `
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #24292f;
    background: #ffffff;
    margin: 0;
    padding: 0;
  }
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
`;

export function create_md(): MarkdownIt {
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

export function build_print_document(title: string, body_html: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escape_html(title)}</title>
<style>${PRINT_STYLES}</style>
</head>
<body>
<h1>${escape_html(title)}</h1>
${body_html}
</body>
</html>`;
}

export async function export_note_as_pdf(
  title: string,
  content: string,
): Promise<void> {
  const md = create_md();
  const body_html = md.render(content);
  const doc_html = build_print_document(title, body_html);

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position: fixed; left: -9999px; width: 0; height: 0;";
  document.body.appendChild(iframe);

  try {
    const iframe_doc = iframe.contentDocument;
    if (!iframe_doc) {
      throw new Error("Failed to access iframe document");
    }

    iframe_doc.open();
    iframe_doc.write(doc_html);
    iframe_doc.close();

    await new Promise<void>((resolve) => {
      iframe.contentWindow?.addEventListener("afterprint", () => resolve());
      iframe.contentWindow?.print();
    });
  } finally {
    iframe.remove();
  }
}
