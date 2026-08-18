interface BuildLiveHtmlDocumentInput {
  content: string;
  theme_style: string;
  bridge_script?: string;
  base_url?: string | undefined;
}

// No meta CSP is injected — the header CSP from `live_html_csp()` in
// src-tauri/src/shared/live_html.rs is the single source for everything
// served via carbide-html:.
export function build_live_html_document({
  content,
  theme_style,
  bridge_script = "",
  base_url,
}: BuildLiveHtmlDocumentInput): string {
  const head = `${base_url ? `<base href="${base_url}">` : ""}${theme_style}${bridge_script}`;
  if (/<head[\s>]/i.test(content)) {
    return content.replace(/<head([^>]*)>/i, `<head$1>${head}`);
  }
  if (/<html[\s>]/i.test(content)) {
    return content.replace(/<html([^>]*)>/i, `<html$1><head>${head}</head>`);
  }
  return `<!DOCTYPE html><html><head>${head}</head><body>${content}</body></html>`;
}
