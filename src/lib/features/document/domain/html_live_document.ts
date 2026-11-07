import { build_live_html_runtime } from "./html_live_runtime";

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
  const runtime = build_live_html_runtime(content);
  const body = runtime.body;
  if (body) {
    content = /<\/body\s*>/i.test(content)
      ? content.replace(/<\/body\s*>/i, () => `${body}</body>`)
      : /<\/html\s*>/i.test(content)
        ? content.replace(/<\/html\s*>/i, () => `${body}</html>`)
        : content + body;
  }
  const head = `${base_url ? `<base href="${base_url}">` : ""}${theme_style}${bridge_script}${runtime.head}`;
  if (/<head[\s>]/i.test(content)) {
    return content.replace(
      /<head([^>]*)>/i,
      (_, attrs: string) => `<head${attrs}>${head}`,
    );
  }
  if (/<html[\s>]/i.test(content)) {
    return content.replace(
      /<html([^>]*)>/i,
      (_, attrs: string) => `<html${attrs}><head>${head}</head>`,
    );
  }
  return `<!DOCTYPE html><html><head>${head}</head><body>${content}</body></html>`;
}
