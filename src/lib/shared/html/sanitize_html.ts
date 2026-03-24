export interface SanitizeHtmlOptions {
  allowed_elements?: Map<string, Set<string>>;
  strip_disallowed?: boolean;
}

const ALWAYS_REMOVE = new Set([
  "script",
  "style",
  "noscript",
  "object",
  "embed",
  "applet",
]);

const GLOBAL_ATTRS = new Set(["id", "class", "style", "title", "dir", "lang"]);

const DEFAULT_ALLOWED: Map<string, Set<string>> = new Map([
  [
    "a",
    new Set([
      "rel",
      "rev",
      "charset",
      "hreflang",
      "tabindex",
      "accesskey",
      "type",
      "name",
      "href",
      "target",
      "title",
      "class",
    ]),
  ],
  ["strong", new Set()],
  ["b", new Set()],
  ["em", new Set()],
  ["i", new Set()],
  ["strike", new Set()],
  ["u", new Set()],
  ["p", new Set()],
  ["ol", new Set(["type", "compact"])],
  ["ul", new Set(["type", "compact"])],
  ["li", new Set()],
  ["br", new Set()],
  [
    "img",
    new Set([
      "longdesc",
      "usemap",
      "src",
      "border",
      "alt",
      "title",
      "hspace",
      "vspace",
      "width",
      "height",
      "align",
    ]),
  ],
  ["sub", new Set()],
  ["sup", new Set()],
  ["blockquote", new Set(["cite"])],
  [
    "table",
    new Set([
      "border",
      "cellspacing",
      "cellpadding",
      "width",
      "frame",
      "rules",
      "height",
      "align",
      "summary",
      "bgcolor",
      "background",
      "bordercolor",
    ]),
  ],
  [
    "tr",
    new Set([
      "rowspan",
      "width",
      "height",
      "align",
      "valign",
      "bgcolor",
      "background",
      "bordercolor",
    ]),
  ],
  ["tbody", new Set()],
  ["thead", new Set()],
  ["tfoot", new Set()],
  [
    "td",
    new Set([
      "colspan",
      "rowspan",
      "width",
      "height",
      "align",
      "valign",
      "bgcolor",
      "background",
      "bordercolor",
      "scope",
    ]),
  ],
  [
    "th",
    new Set([
      "colspan",
      "rowspan",
      "width",
      "height",
      "align",
      "valign",
      "scope",
    ]),
  ],
  ["caption", new Set()],
  ["div", new Set()],
  ["span", new Set()],
  ["code", new Set()],
  ["pre", new Set()],
  ["address", new Set()],
  ["h1", new Set()],
  ["h2", new Set()],
  ["h3", new Set()],
  ["h4", new Set()],
  ["h5", new Set()],
  ["h6", new Set()],
  ["hr", new Set(["size", "noshade"])],
  ["font", new Set(["face", "size", "color"])],
  ["dd", new Set()],
  ["dl", new Set()],
  ["dt", new Set()],
  ["cite", new Set()],
  ["abbr", new Set()],
  ["acronym", new Set()],
  ["del", new Set(["datetime", "cite"])],
  ["ins", new Set(["datetime", "cite"])],
  ["bdo", new Set()],
  ["col", new Set(["align", "char", "charoff", "span", "valign", "width"])],
  [
    "colgroup",
    new Set(["align", "char", "charoff", "span", "valign", "width"]),
  ],
  ["dfn", new Set()],
  ["kbd", new Set()],
  ["label", new Set(["for"])],
  ["legend", new Set()],
  ["q", new Set(["cite"])],
  ["samp", new Set()],
  ["var", new Set()],
]);

export function get_default_allowlist(): Map<string, Set<string>> {
  return new Map(
    [...DEFAULT_ALLOWED.entries()].map(([tag, attrs]) => [tag, new Set(attrs)]),
  );
}

export function sanitize_html(
  html: string,
  options: SanitizeHtmlOptions = {},
): string {
  const allowed = options.allowed_elements ?? DEFAULT_ALLOWED;
  const strip = options.strip_disallowed ?? true;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const body = doc.body;

  sanitize_node(body, allowed, strip);

  return body.innerHTML;
}

function sanitize_node(
  node: Node,
  allowed: Map<string, Set<string>>,
  strip: boolean,
): void {
  const children = [...node.childNodes];

  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) continue;

    if (child.nodeType === Node.COMMENT_NODE) {
      node.removeChild(child);
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) {
      node.removeChild(child);
      continue;
    }

    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    const allowed_attrs = allowed.get(tag);

    if (!allowed_attrs) {
      if (ALWAYS_REMOVE.has(tag)) {
        node.removeChild(el);
      } else if (strip) {
        const fragment = el.ownerDocument.createDocumentFragment();
        while (el.firstChild) fragment.appendChild(el.firstChild);
        sanitize_node(fragment, allowed, strip);
        node.replaceChild(fragment, el);
      } else {
        node.removeChild(el);
      }
      continue;
    }

    const attr_names = [...el.getAttributeNames()];
    for (const attr of attr_names) {
      if (!allowed_attrs.has(attr) && !GLOBAL_ATTRS.has(attr)) {
        el.removeAttribute(attr);
      }
    }

    if (tag === "a") {
      const href = el.getAttribute("href");
      if (href && /^\s*javascript\s*:/i.test(href)) {
        el.removeAttribute("href");
      }
    }

    sanitize_node(el, allowed, strip);
  }
}
