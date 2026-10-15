export interface SanitizeHtmlOptions {
  allowed_elements?: Map<string, Set<string>>;
  strip_disallowed?: boolean;
  allowed_style_properties?: Set<string>;
}

const ALWAYS_REMOVE = new Set([
  "script",
  "style",
  "noscript",
  "object",
  "embed",
  "applet",
  "iframe",
  "foreignobject",
  "svg",
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
  const styles = options.allowed_style_properties ?? null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const body = doc.body;

  sanitize_node(body, allowed, strip, styles);

  return body.innerHTML;
}

const PREVIEW_ELEMENTS: Record<string, string[]> = {
  article: [],
  aside: [],
  footer: [],
  header: [],
  main: [],
  nav: [],
  section: [],
  details: ["open"],
  summary: [],
  figure: [],
  figcaption: [],
  mark: [],
  time: ["datetime"],
  audio: ["src", "controls", "loop", "muted", "preload"],
  video: [
    "src",
    "poster",
    "controls",
    "loop",
    "muted",
    "preload",
    "width",
    "height",
  ],
  source: ["src", "type", "media"],
  track: ["src", "kind", "srclang", "label", "default"],
  form: [],
  input: ["type", "value", "placeholder", "checked", "name", "disabled"],
  button: ["type", "disabled"],
  select: ["name", "disabled"],
  option: ["value", "selected"],
  textarea: ["placeholder", "disabled"],
};

// Keys are lowercase (sanitize_node lowercases tag names); attribute names
// keep the camelCase the HTML parser gives SVG attributes (viewBox, refX, ...).
const SVG_TAGS = [
  "svg",
  "g",
  "defs",
  "symbol",
  "use",
  "path",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "rect",
  "text",
  "tspan",
  "textpath",
  "title",
  "desc",
  "image",
  "clippath",
  "mask",
  "pattern",
  "marker",
  "lineargradient",
  "radialgradient",
  "stop",
  "filter",
  "feblend",
  "fecolormatrix",
  "fecomposite",
  "fedropshadow",
  "feflood",
  "fegaussianblur",
  "femerge",
  "femergenode",
  "feoffset",
];

const SVG_ATTRS = [
  "xmlns",
  "viewBox",
  "preserveAspectRatio",
  "href",
  "xlink:href",
  "role",
  "aria-label",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "fx",
  "fy",
  "dx",
  "dy",
  "width",
  "height",
  "d",
  "points",
  "pathLength",
  "transform",
  "offset",
  "rotate",
  "textLength",
  "lengthAdjust",
  "startOffset",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "opacity",
  "color",
  "visibility",
  "display",
  "paint-order",
  "vector-effect",
  "shape-rendering",
  "clip-path",
  "clip-rule",
  "mask",
  "filter",
  "marker-start",
  "marker-mid",
  "marker-end",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
  "alignment-baseline",
  "stop-color",
  "stop-opacity",
  "flood-color",
  "flood-opacity",
  "gradientUnits",
  "gradientTransform",
  "spreadMethod",
  "clipPathUnits",
  "maskUnits",
  "maskContentUnits",
  "patternUnits",
  "patternContentUnits",
  "patternTransform",
  "markerWidth",
  "markerHeight",
  "markerUnits",
  "refX",
  "refY",
  "orient",
  "filterUnits",
  "primitiveUnits",
  "stdDeviation",
  "in",
  "in2",
  "result",
  "mode",
  "operator",
  "type",
  "values",
];

export function get_preview_allowlist(): Map<string, Set<string>> {
  const allowed = get_default_allowlist();
  for (const [tag, attrs] of Object.entries(PREVIEW_ELEMENTS)) {
    allowed.set(tag, new Set(attrs));
  }
  const svg_attrs = new Set(SVG_ATTRS);
  for (const tag of SVG_TAGS) {
    allowed.set(tag, svg_attrs);
  }
  return allowed;
}

export function sanitize_html_preview(html: string): {
  body: string;
  styles: string;
} {
  const source = new DOMParser().parseFromString(html, "text/html");
  const styles = Array.from(source.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .join("\n");
  const clean = sanitize_html(source.body.innerHTML, {
    allowed_elements: get_preview_allowlist(),
  });
  const preview = new DOMParser().parseFromString(clean, "text/html");
  for (const form of preview.querySelectorAll("form")) {
    form.removeAttribute("action");
    form.removeAttribute("method");
  }
  for (const control of preview.querySelectorAll(
    "input,button,select,textarea",
  )) {
    control.setAttribute("disabled", "");
  }
  return { body: preview.body.innerHTML, styles };
}

const LINK_ATTRS = ["href", "xlink:href"];
const EXTERNAL_LINK_TAGS = new Set(["a", "image"]);

function is_unsafe_link(value: string, tag: string): boolean {
  if (/^\s*javascript\s*:/i.test(value)) return true;
  return !EXTERNAL_LINK_TAGS.has(tag) && !value.trim().startsWith("#");
}

function strip_unsafe_links(el: Element, tag: string): void {
  for (const attr of LINK_ATTRS) {
    const value = el.getAttribute(attr);
    if (value !== null && is_unsafe_link(value, tag)) {
      el.removeAttribute(attr);
    }
  }
}

function filter_style(el: Element, properties: Set<string>): void {
  const style = el.getAttribute("style");
  if (style === null) return;
  const kept = style
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => {
      const colon = declaration.indexOf(":");
      const property = declaration.slice(0, colon).trim().toLowerCase();
      return colon > 0 && properties.has(property);
    });
  if (kept.length === 0) el.removeAttribute("style");
  else el.setAttribute("style", kept.join("; "));
}

function sanitize_node(
  node: Node,
  allowed: Map<string, Set<string>>,
  strip: boolean,
  styles: Set<string> | null,
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
        sanitize_node(fragment, allowed, strip, styles);
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

    strip_unsafe_links(el, tag);

    if (styles) filter_style(el, styles);

    sanitize_node(el, allowed, strip, styles);
  }
}
