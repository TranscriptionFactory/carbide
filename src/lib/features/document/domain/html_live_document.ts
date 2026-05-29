interface BuildLiveHtmlDocumentInput {
  content: string;
  theme_style: string;
  allow_network: boolean;
}

export function build_live_csp(allow_network: boolean): string {
  const connect = allow_network ? "*" : "'none'";
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval'",
    "style-src 'unsafe-inline'",
    "img-src data: blob:" + (allow_network ? " https: http:" : ""),
    "font-src data:" + (allow_network ? " https: http:" : ""),
    "media-src data: blob:" + (allow_network ? " https: http:" : ""),
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
