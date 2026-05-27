import { parse_frontmatter } from "$lib/shared/domain/frontmatter_parser";
import { create_md } from "$lib/features/document/domain/pdf_export";

export const PRINT_STORAGE_KEY = "carbide:print_data";

const md = create_md();

let mermaid_instance: (typeof import("mermaid"))["default"] | null = null;

async function get_mermaid() {
  if (!mermaid_instance) {
    const m = await import("mermaid");
    m.default.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "loose",
    });
    mermaid_instance = m.default;
  }
  return mermaid_instance;
}

const PRINT_STYLES = `
@page { margin: 20mm; }
* { box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  color: #1a1a1a;
  max-width: 100%;
  margin: 0;
  padding: 2em;
}
@media print {
  body { padding: 0; }
}
h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 600; }
h1 { font-size: 1.8em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.2em; }
h3 { font-size: 1.25em; }
h4 { font-size: 1.1em; }
p { margin: 0.8em 0; }
a { color: #0969da; text-decoration: none; }
code {
  font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
  font-size: 0.85em;
  background: #f6f8fa;
  padding: 0.2em 0.4em;
  border-radius: 3px;
}
pre {
  background: #f6f8fa;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  padding: 1em;
  overflow-x: auto;
  page-break-inside: avoid;
}
pre code { background: none; padding: 0; font-size: 0.85em; }
blockquote {
  border-left: 3px solid #d0d7de;
  margin: 0.8em 0;
  padding: 0.5em 1em;
  color: #57606a;
}
table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  page-break-inside: avoid;
}
th, td {
  border: 1px solid #d0d7de;
  padding: 0.5em 0.75em;
  text-align: left;
}
th { background: #f6f8fa; font-weight: 600; }
hr { border: none; border-top: 1px solid #d0d7de; margin: 1.5em 0; }
ul, ol { padding-left: 1.5em; margin: 0.5em 0; }
li { margin: 0.25em 0; }
img { max-width: 100%; height: auto; }
.mermaid-svg {
  width: 100%;
  page-break-inside: avoid;
  margin: 1em 0;
  text-align: center;
}
.mermaid-svg svg { max-width: 100%; height: auto; }
.print-title { margin-top: 0; }
`;

export async function render_note_for_print(
  title: string,
  markdown: string,
): Promise<string> {
  const body = parse_frontmatter(markdown).body;
  let html = md.render(body);

  html = await render_mermaid_blocks(html);

  const body_html = `<h1 class="print-title">${escape_html(title)}</h1>\n${html}`;
  return JSON.stringify({ css: PRINT_STYLES, body_html });
}

export function extract_print_content(raw: string): {
  css: string;
  body_html: string;
} {
  return JSON.parse(raw) as { css: string; body_html: string };
}

async function render_mermaid_blocks(html: string): Promise<string> {
  const mermaid_regex =
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g;
  const matches = [...html.matchAll(mermaid_regex)];
  if (matches.length === 0) return html;

  const mermaid = await get_mermaid();

  const rendered: (string | null)[] = await Promise.all(
    matches.map(async (match, i) => {
      const diagram_source = decode_html_entities(match[1]!);
      try {
        const { svg } = await mermaid.render(
          `mermaid-print-${i}`,
          diagram_source,
        );
        return `<div class="mermaid-svg">${svg}</div>`;
      } catch {
        return null;
      }
    }),
  );

  const parts: string[] = [];
  let cursor = 0;
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    parts.push(html.slice(cursor, match.index));
    parts.push(rendered[i] ?? match[0]);
    cursor = match.index! + match[0].length;
  }
  parts.push(html.slice(cursor));
  return parts.join("");
}

function decode_html_entities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escape_html(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
