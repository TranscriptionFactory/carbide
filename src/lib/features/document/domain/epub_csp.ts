// Same-origin book iframes are required for pagination, so book scripts are
// neutralized with a strict per-document CSP instead of an iframe sandbox.
// `blob:` is allowed for img/style/font/media because foliate serves the
// book's own resources (including linked stylesheets) as blob: URLs.
export const BOOK_CSP =
  "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline' data: blob:; " +
  "font-src data: blob:; media-src data: blob:; script-src 'none'";

// Self-closing so the tag is well-formed in both text/html and the
// application/xhtml+xml documents foliate re-serializes for EPUB3 sections.
const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${BOOK_CSP}" />`;

export function is_html_type(type: string): boolean {
  return (
    type.startsWith("application/xhtml+xml") || type.startsWith("text/html")
  );
}

export function inject_csp(html: string): string {
  const head = /<head[^>]*>/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + CSP_META + html.slice(at);
  }
  const root = /<html[^>]*>/i.exec(html);
  if (root) {
    const at = root.index + root[0].length;
    return `${html.slice(0, at)}<head>${CSP_META}</head>${html.slice(at)}`;
  }
  return CSP_META + html;
}
