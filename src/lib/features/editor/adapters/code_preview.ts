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

export function set_meta_token(
  meta: string,
  token: string,
  present: boolean,
): string {
  const tokens = meta
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => t.split("=")[0] !== token);
  if (present) tokens.push(token);
  return tokens.join(" ");
}

export function should_show_preview(language: string, meta: string): boolean {
  return is_previewable_language(language) && meta_has_token(meta, "preview");
}

const PREVIEW_BASE_STYLES = `
body { margin: 0; padding: 12px 16px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; line-height: 1.55; color: var(--foreground, #18181b); background: var(--background, #ffffff); word-wrap: break-word; }
img, video, canvas, svg { max-width: 100%; }
`;

export const PREVIEW_THEME_TOKENS = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--muted",
  "--muted-foreground",
  "--border",
  "--input",
  "--ring",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--radius",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
];

export function read_preview_theme_tokens(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const computed = getComputedStyle(document.documentElement);
  const tokens: Record<string, string> = {};
  for (const name of PREVIEW_THEME_TOKENS) {
    const value = computed.getPropertyValue(name).trim();
    if (value) tokens[name] = value;
  }
  return tokens;
}

export function render_root_block(
  theme: "light" | "dark",
  tokens: Record<string, string>,
): string {
  const decls = Object.entries(tokens)
    .filter(([name, value]) => !/[<>{}]/.test(name + value))
    .map(([name, value]) => `${name}:${value};`)
    .join("");
  return `:root{color-scheme:${theme};${decls}}`;
}

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
  tokens: Record<string, string> = {},
): string {
  const body = wrap_preview_body(language, source);
  const dark_class = theme === "dark" ? ' class="dark"' : "";
  const root_block = render_root_block(theme, tokens);
  return `<!DOCTYPE html><html${dark_class}><head><meta charset="utf-8"><style>${root_block}${PREVIEW_BASE_STYLES}</style></head><body>${body}</body></html>`;
}
