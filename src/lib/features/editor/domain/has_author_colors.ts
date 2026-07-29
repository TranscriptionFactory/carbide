const COLOR_DECLARATION_RE =
  /(?:^|[;{\s])(?:color|background(?:-color|-image)?)\s*:/i;
const STYLE_ATTR_RE = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const STYLE_BLOCK_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const COLOR_ATTR_RE = /\s(?:bgcolor|bordercolor|background)\s*=/i;
const FONT_COLOR_RE = /<font\b[^>]*\bcolor\s*=/i;

function declares_color(html: string, pattern: RegExp): boolean {
  for (const match of html.matchAll(pattern)) {
    const value = match[1] ?? match[2] ?? "";
    if (COLOR_DECLARATION_RE.test(value)) return true;
  }
  return false;
}

export function has_author_colors(html: string): boolean {
  return (
    COLOR_ATTR_RE.test(html) ||
    FONT_COLOR_RE.test(html) ||
    declares_color(html, STYLE_ATTR_RE) ||
    declares_color(html, STYLE_BLOCK_RE)
  );
}
