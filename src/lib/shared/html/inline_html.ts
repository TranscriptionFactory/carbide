import { sanitize_html } from "./sanitize_html";

export type InlineHtmlTag = {
  name: string;
  kind: "open" | "close" | "void";
};

export type InlineHtmlElement = {
  name: string;
  attrs: Record<string, string>;
};

const INLINE_HTML_ELEMENTS: Map<string, Set<string>> = new Map([
  ["br", new Set()],
  ["u", new Set()],
  ["s", new Set()],
  ["sub", new Set()],
  ["sup", new Set()],
  ["kbd", new Set()],
  ["mark", new Set()],
  ["span", new Set()],
  ["font", new Set(["face", "size", "color"])],
]);

const INLINE_HTML_STYLE_PROPERTIES = new Set([
  "color",
  "background-color",
  "font-weight",
  "font-style",
  "font-size",
  "text-decoration",
]);

const VOID_ELEMENTS = new Set(["br"]);

const OPEN_TAG_RE = /^<([a-z][a-z0-9]*)(?:\s[\s\S]*?)?(\/?)>$/i;
const CLOSE_TAG_RE = /^<\/([a-z][a-z0-9]*)\s*>$/i;

export function parse_inline_html_tag(value: string): InlineHtmlTag | null {
  const close = CLOSE_TAG_RE.exec(value);
  if (close) return whitelisted(close[1], "close");
  const open = OPEN_TAG_RE.exec(value);
  if (!open) return null;
  const name = open[1]?.toLowerCase() ?? "";
  const is_void = open[2] === "/" || VOID_ELEMENTS.has(name);
  return whitelisted(name, is_void ? "void" : "open");
}

function whitelisted(
  name: string | undefined,
  kind: InlineHtmlTag["kind"],
): InlineHtmlTag | null {
  const lower = name?.toLowerCase() ?? "";
  return INLINE_HTML_ELEMENTS.has(lower) ? { name: lower, kind } : null;
}

export function is_inline_html_break(value: string): boolean {
  const tag = parse_inline_html_tag(value);
  return tag?.name === "br" && tag.kind === "void";
}

export function sanitize_inline_html_open_tag(
  open: string,
): InlineHtmlElement | null {
  const clean = sanitize_html(open, {
    allowed_elements: INLINE_HTML_ELEMENTS,
    allowed_style_properties: INLINE_HTML_STYLE_PROPERTIES,
  });
  const el = new DOMParser().parseFromString(clean, "text/html").body
    .firstElementChild;
  if (!el) return null;
  const attrs: Record<string, string> = {};
  for (const attr of el.getAttributeNames()) {
    attrs[attr] = el.getAttribute(attr) ?? "";
  }
  return { name: el.tagName.toLowerCase(), attrs };
}
