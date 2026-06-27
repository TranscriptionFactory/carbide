const LANGUAGE_ALIASES: Record<string, string> = {
  htm: "html",
  javascript: "js",
  mjs: "js",
  svg: "xml",
};

const PREVIEWABLE_LANGUAGES = new Set(["html", "xml", "css", "js"]);

export function normalize_preview_language(language: string): string {
  const lang = language.trim().toLowerCase();
  return LANGUAGE_ALIASES[lang] ?? lang;
}

export function is_previewable_language(language: string): boolean {
  return PREVIEWABLE_LANGUAGES.has(normalize_preview_language(language));
}

export function meta_has_token(meta: string, token: string): boolean {
  return meta
    .split(/\s+/)
    .map((t) => t.split("=")[0])
    .includes(token);
}

export function should_show_preview(language: string, meta: string): boolean {
  return is_previewable_language(language) && meta_has_token(meta, "preview");
}

const PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https:",
  "style-src 'unsafe-inline' https: data:",
  "img-src https: data: blob:",
  "font-src https: data:",
  "connect-src https: data: blob:",
  "media-src https: data: blob:",
  "frame-src https:",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

const PREVIEW_BASE_STYLES = `
:root { color-scheme: light dark; }
body { margin: 0; padding: 12px 16px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; line-height: 1.55; color: var(--carbide-fg, #18181b); background: var(--carbide-bg, transparent); word-wrap: break-word; }
img, video, canvas, svg { max-width: 100%; }
`;

export const CODE_PREVIEW_SANDBOX = "allow-scripts";

function wrap_preview_body(language: string, source: string): string {
  switch (normalize_preview_language(language)) {
    case "css":
      return `<style>${source}</style>`;
    case "js":
      return `<script>${source}</script>`;
    default:
      return source;
  }
}

export function build_code_preview_srcdoc(
  language: string,
  source: string,
  theme: "light" | "dark" = "light",
): string {
  const body = wrap_preview_body(language, source);
  const dark_class = theme === "dark" ? ' class="dark"' : "";
  return `<!DOCTYPE html><html${dark_class}><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><style>${PREVIEW_BASE_STYLES}</style></head><body>${body}</body></html>`;
}
