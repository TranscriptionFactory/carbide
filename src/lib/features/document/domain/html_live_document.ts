interface BuildLiveHtmlDocumentInput {
  content: string;
  theme_style: string;
}

// No meta CSP is injected — the header CSP from `live_html_csp()` in
// src-tauri/src/shared/live_html.rs is the single source for everything
// served via carbide-html:.
export function build_live_html_document({
  content,
  theme_style,
}: BuildLiveHtmlDocumentInput): string {
  if (/<head[\s>]/i.test(content)) {
    return content.replace(/<head([^>]*)>/i, `<head$1>${theme_style}`);
  }
  if (/<html[\s>]/i.test(content)) {
    return content.replace(
      /<html([^>]*)>/i,
      `<html$1><head>${theme_style}</head>`,
    );
  }
  return `<!DOCTYPE html><html><head>${theme_style}</head><body>${content}</body></html>`;
}
