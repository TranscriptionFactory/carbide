import MarkdownIt from "markdown-it";
import { sanitize_html } from "$lib/shared/html";
import type { RagCitation } from "$lib/features/rag/domain/rag_types";

const CITATION_MARKER = /\[(\d+)\]/g;
// private-use sentinels pass through markdown-it and sanitization untouched,
// so citation markers survive rendering and become buttons afterwards
const SENTINEL_OPEN = "\uE000";
const SENTINEL_CLOSE = "\uE001";
const SENTINEL_RE = /\uE000(\d+)\uE001/g;

export const CITATION_INDEX_ATTR = "data-citation-index";

const CITATION_BUTTON_CLASS =
  "mx-0.5 inline-flex items-center rounded bg-muted px-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
}).enable(["table", "strikethrough"]);

function escape_attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function citation_button(citation: RagCitation): string {
  const index = String(citation.index);
  return (
    `<button type="button" class="${CITATION_BUTTON_CLASS}" ` +
    `${CITATION_INDEX_ATTR}="${index}" ` +
    `title="${escape_attr(citation.title)}">[${index}]</button>`
  );
}

export function render_rag_markdown(
  content: string,
  citations: Map<number, RagCitation>,
): string {
  const marked = content.replace(CITATION_MARKER, (match, digits: string) =>
    citations.has(Number(digits))
      ? `${SENTINEL_OPEN}${digits}${SENTINEL_CLOSE}`
      : match,
  );
  const html = sanitize_html(md.render(marked));
  return html.replace(SENTINEL_RE, (_match, digits: string) => {
    const citation = citations.get(Number(digits));
    return citation ? citation_button(citation) : `[${digits}]`;
  });
}
