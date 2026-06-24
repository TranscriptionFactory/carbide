interface BuildLiveHtmlDocumentInput {
  content: string;
  theme_style: string;
  allow_network: boolean;
}

// Canonical CSP policy — kept in lockstep with `live_html_csp()` in
// src-tauri/src/shared/live_html.rs. The directive table is pinned by tests on both
// sides (carbide/plans/2026-06-24_live_html_remote_scripts_plan.md). `https:` in
// script-src/style-src and `connect-src *` are gated on the live+net tier.
export function build_live_csp(allow_network: boolean): string {
  const script_src = allow_network
    ? "script-src 'unsafe-inline' 'unsafe-eval' blob: data: https:"
    : "script-src 'unsafe-inline' 'unsafe-eval' blob: data:";
  const style_src = allow_network
    ? "style-src 'unsafe-inline' data: https:"
    : "style-src 'unsafe-inline' data:";
  const connect = allow_network ? "*" : "'none'";
  return [
    "default-src 'none'",
    script_src,
    style_src,
    "img-src data: blob: https: http: carbide-html:",
    "font-src data: https: http: carbide-html:",
    "media-src data: blob: https: http: carbide-html:",
    "frame-src data: blob:",
    `connect-src ${connect}`,
  ].join("; ");
}

export function build_live_html_document({
  content,
  theme_style,
  allow_network,
}: BuildLiveHtmlDocumentInput): string {
  const csp = build_live_csp(allow_network);
  const meta_csp = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;

  if (/<head[\s>]/i.test(content)) {
    return content.replace(
      /<head([^>]*)>/i,
      `<head$1>${meta_csp}${theme_style}`,
    );
  }
  if (/<html[\s>]/i.test(content)) {
    return content.replace(
      /<html([^>]*)>/i,
      `<html$1><head>${meta_csp}${theme_style}</head>`,
    );
  }
  return `<!DOCTYPE html><html><head>${meta_csp}${theme_style}</head><body>${content}</body></html>`;
}
