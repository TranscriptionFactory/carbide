import { Schema } from "prosemirror-model";
import type { NodeSpec, MarkSpec } from "prosemirror-model";

const doc: NodeSpec = {
  content: "block+",
};

const paragraph: NodeSpec = {
  content: "inline*",
  group: "block",
  parseDOM: [{ tag: "p" }],
  toDOM() {
    return ["p", 0];
  },
};

const heading: NodeSpec = {
  attrs: {
    id: { default: "" },
    level: { default: 1 },
  },
  content: "inline*",
  group: "block",
  defining: true,
  parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
    tag: `h${String(level)}`,
    getAttrs(dom) {
      if (!(dom instanceof HTMLElement)) return false;
      return { level, id: dom.getAttribute("id") || "" };
    },
  })),
  toDOM(node) {
    const attrs: Record<string, string> = {};
    if (node.attrs["id"]) attrs["id"] = node.attrs["id"] as string;
    return [`h${String(node.attrs["level"])}`, attrs, 0];
  },
};

const blockquote: NodeSpec = {
  content: "block+",
  group: "block",
  defining: true,
  parseDOM: [{ tag: "blockquote" }],
  toDOM() {
    return ["blockquote", 0];
  },
};

const code_block: NodeSpec = {
  content: "text*",
  group: "block",
  marks: "",
  defining: true,
  code: true,
  attrs: {
    language: { default: "" },
  },
  parseDOM: [
    {
      tag: "pre",
      preserveWhitespace: "full" as const,
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false;
        return { language: dom.dataset["language"] || "" };
      },
    },
  ],
  toDOM(node) {
    return [
      "pre",
      { "data-language": (node.attrs["language"] as string) || undefined },
      ["code", 0],
    ];
  },
};

const horizontal_rule: NodeSpec = {
  group: "block",
  parseDOM: [{ tag: "hr" }],
  toDOM() {
    return ["hr"];
  },
};

const bullet_list: NodeSpec = {
  content: "list_item+",
  group: "block",
  parseDOM: [{ tag: "ul" }],
  toDOM() {
    return ["ul", 0];
  },
};

const ordered_list: NodeSpec = {
  content: "list_item+",
  group: "block",
  attrs: {
    order: { default: 1 },
  },
  parseDOM: [
    {
      tag: "ol",
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false;
        return {
          order: dom.hasAttribute("start")
            ? +(dom.getAttribute("start") || 1)
            : 1,
        };
      },
    },
  ],
  toDOM(node) {
    return (node.attrs["order"] as number) === 1
      ? ["ol", 0]
      : ["ol", { start: node.attrs["order"] as number }, 0];
  },
};

const list_item: NodeSpec = {
  content: "paragraph block*",
  group: "listItem",
  defining: true,
  attrs: {
    label: { default: "•" },
    listType: { default: "bullet" },
    spread: { default: "true" },
    checked: { default: null },
  },
  parseDOM: [
    {
      tag: 'li[data-item-type="task"]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false;
        return {
          label: dom.dataset["label"],
          listType: dom.dataset["listType"],
          spread: dom.dataset["spread"],
          checked: dom.dataset["checked"]
            ? dom.dataset["checked"] === "true"
            : null,
        };
      },
    },
    {
      tag: "li",
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false;
        return {
          label: dom.dataset["label"] || "•",
          listType: dom.dataset["listType"] || "bullet",
          spread: dom.dataset["spread"] || "true",
        };
      },
    },
  ],
  toDOM(node) {
    if (node.attrs["checked"] != null) {
      return [
        "li",
        {
          "data-item-type": "task",
          "data-label": node.attrs["label"] as string,
          "data-list-type": node.attrs["listType"] as string,
          "data-spread": node.attrs["spread"] as string,
          "data-checked": String(node.attrs["checked"]),
        },
        0,
      ];
    }
    return [
      "li",
      {
        "data-label": node.attrs["label"] as string,
        "data-list-type": node.attrs["listType"] as string,
        "data-spread": node.attrs["spread"] as string,
      },
      0,
    ];
  },
};

const excalidraw_embed: NodeSpec = {
  group: "block",
  selectable: true,
  draggable: true,
  atom: true,
  marks: "",
  attrs: {
    src: { default: "" },
  },
  parseDOM: [
    {
      tag: 'div[data-type="excalidraw-embed"]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false;
        return { src: dom.getAttribute("data-src") ?? "" };
      },
    },
  ],
  toDOM(node) {
    return [
      "div",
      {
        "data-type": "excalidraw-embed",
        "data-src": node.attrs["src"] as string,
      },
    ];
  },
};

const image_block: NodeSpec = {
  group: "block",
  selectable: true,
  draggable: true,
  marks: "",
  atom: true,
  defining: true,
  isolating: true,
  attrs: {
    src: { default: "" },
    caption: { default: "" },
    alt: { default: "" },
    title: { default: "" },
    ratio: { default: 1 },
    width: { default: "" },
  },
  parseDOM: [
    {
      tag: 'img[data-type="image-block"]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false;
        return {
          src: dom.getAttribute("src") ?? "",
          caption: dom.getAttribute("caption") ?? "",
          alt: dom.getAttribute("alt") ?? "",
          title: dom.getAttribute("title") ?? "",
          ratio: Number(dom.getAttribute("ratio") ?? 1),
          width: dom.getAttribute("data-width") ?? "",
        };
      },
    },
  ],
  toDOM(node) {
    return [
      "img",
      {
        "data-type": "image-block",
        src: String(node.attrs["src"] ?? ""),
        caption: String(node.attrs["caption"] ?? ""),
        alt: String(node.attrs["alt"] ?? ""),
        title: String(node.attrs["title"] ?? ""),
        ratio: String(node.attrs["ratio"] ?? 1),
        "data-width": String(node.attrs["width"] ?? ""),
      },
    ];
  },
};

const image: NodeSpec = {
  inline: true,
  group: "inline",
  selectable: true,
  draggable: true,
  marks: "",
  atom: true,
  defining: true,
  isolating: true,
  attrs: {
    src: { default: "" },
    alt: { default: "" },
    title: { default: "" },
  },
  parseDOM: [
    {
      tag: "img[src]",
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false;
        return {
          src: dom.getAttribute("src") || "",
          alt: dom.getAttribute("alt") || "",
          title: dom.getAttribute("title") || dom.getAttribute("alt") || "",
        };
      },
    },
  ],
  toDOM(node) {
    return [
      "img",
      {
        src: node.attrs["src"] as string,
        alt: node.attrs["alt"] as string,
        title: node.attrs["title"] as string,
      },
    ];
  },
};

const hardbreak: NodeSpec = {
  inline: true,
  group: "inline",
  selectable: false,
  parseDOM: [{ tag: "br" }],
  toDOM() {
    return ["br"];
  },
  leafText() {
    return "\n";
  },
};

const details_block: NodeSpec = {
  group: "block",
  content: "details_summary details_content",
  defining: true,
  attrs: {
    open: { default: false },
  },
  parseDOM: [
    {
      tag: "details",
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false;
        return { open: dom.hasAttribute("open") };
      },
    },
  ],
  toDOM(node) {
    return [
      "details",
      {
        ...(node.attrs["open"] ? { open: "" } : {}),
        class: "details-block",
      },
      0,
    ];
  },
};

const details_summary: NodeSpec = {
  content: "inline*",
  defining: true,
  isolating: true,
  parseDOM: [{ tag: "summary" }],
  toDOM() {
    return ["summary", { class: "details-block__summary" }, 0];
  },
};

const details_content: NodeSpec = {
  content: "block+",
  defining: true,
  parseDOM: [{ tag: "div[data-details-content]" }],
  toDOM() {
    return [
      "div",
      { "data-details-content": "", class: "details-block__content" },
      0,
    ];
  },
};

const file_embed: NodeSpec = {
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  marks: "",
  attrs: {
    src: { default: "" },
    page: { default: null },
    height: { default: 400 },
    file_type: { default: "" },
  },
  parseDOM: [
    {
      tag: 'div[data-type="file-embed"]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false;
        return {
          src: dom.getAttribute("data-src") ?? "",
          page: dom.getAttribute("data-page")
            ? Number(dom.getAttribute("data-page"))
            : null,
          height: Number(dom.getAttribute("data-height") || 400),
          file_type: dom.getAttribute("data-file-type") ?? "",
        };
      },
    },
  ],
  toDOM(node) {
    return [
      "div",
      {
        "data-type": "file-embed",
        "data-src": node.attrs["src"] as string,
        ...(node.attrs["page"] != null
          ? { "data-page": String(node.attrs["page"]) }
          : {}),
        "data-height": String(node.attrs["height"]),
        "data-file-type": node.attrs["file_type"] as string,
      },
    ];
  },
};

const frontmatter: NodeSpec = {
  group: "block",
  content: "text*",
  code: true,
  defining: true,
  attrs: {},
  parseDOM: [
    {
      tag: "div[data-type='frontmatter']",
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false;
        return {};
      },
    },
  ],
  toDOM() {
    return [
      "div",
      {
        "data-type": "frontmatter",
        class: "frontmatter-hidden",
        style: "display:none",
      },
      0,
    ];
  },
};

const math_inline: NodeSpec = {
  group: "inline",
  content: "text*",
  inline: true,
  atom: true,
  marks: "",
  parseDOM: [
    {
      tag: "span[data-type='math_inline']",
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false;
        return {};
      },
    },
  ],
  toDOM() {
    return ["span", { "data-type": "math_inline" }, 0];
  },
};

const math_block: NodeSpec = {
  content: "text*",
  group: "block",
  marks: "",
  defining: true,
  atom: true,
  isolating: true,
  attrs: { value: { default: "" } },
  parseDOM: [
    {
      tag: "div[data-type='math_block']",
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false;
        return { value: dom.dataset["value"] ?? "" };
      },
    },
  ],
  toDOM(node) {
    return [
      "div",
      {
        "data-type": "math_block",
        "data-value": node.attrs["value"] as string,
      },
      0,
    ];
  },
};

const table: NodeSpec = {
  content: "table_header_row table_row*",
  group: "block",
  tableRole: "table",
  isolating: true,
  parseDOM: [{ tag: "table" }],
  toDOM() {
    return ["table", ["tbody", 0]];
  },
};

const table_header_row: NodeSpec = {
  content: "(table_header)*",
  tableRole: "row",
  parseDOM: [
    { tag: "tr[data-is-header]" },
    {
      tag: "tr",
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false;
        return dom.querySelector("th") ? {} : false;
      },
    },
  ],
  toDOM() {
    return ["tr", { "data-is-header": "true" }, 0];
  },
};

const table_row: NodeSpec = {
  content: "(table_cell)*",
  tableRole: "row",
  parseDOM: [{ tag: "tr" }],
  toDOM() {
    return ["tr", 0];
  },
};

const table_header: NodeSpec = {
  content: "paragraph+",
  tableRole: "header_cell",
  attrs: {
    alignment: { default: "left" },
    colspan: { default: 1 },
    rowspan: { default: 1 },
    colwidth: { default: null },
  },
  isolating: true,
  parseDOM: [
    {
      tag: "th",
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false;
        return {
          alignment: dom.style.textAlign || "left",
          colspan: Number(dom.getAttribute("colspan") || 1),
          rowspan: Number(dom.getAttribute("rowspan") || 1),
          colwidth: null,
        };
      },
    },
  ],
  toDOM(node) {
    return [
      "th",
      { style: `text-align: ${(node.attrs["alignment"] as string) || "left"}` },
      0,
    ];
  },
};

const table_cell: NodeSpec = {
  content: "paragraph+",
  tableRole: "cell",
  attrs: {
    alignment: { default: "left" },
    colspan: { default: 1 },
    rowspan: { default: 1 },
    colwidth: { default: null },
  },
  isolating: true,
  parseDOM: [
    {
      tag: "td",
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false;
        return {
          alignment: dom.style.textAlign || "left",
          colspan: Number(dom.getAttribute("colspan") || 1),
          rowspan: Number(dom.getAttribute("rowspan") || 1),
          colwidth: null,
        };
      },
    },
  ],
  toDOM(node) {
    return [
      "td",
      { style: `text-align: ${(node.attrs["alignment"] as string) || "left"}` },
      0,
    ];
  },
};

const strong: MarkSpec = {
  parseDOM: [
    {
      tag: "b",
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false;
        return dom.style.fontWeight !== "normal" && null;
      },
    },
    { tag: "strong" },
    {
      style: "font-weight",
      getAttrs(value) {
        if (typeof value !== "string") return false;
        return /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null;
      },
    },
  ],
  toDOM() {
    return ["strong", 0];
  },
};

const em: MarkSpec = {
  parseDOM: [
    { tag: "i" },
    { tag: "em" },
    {
      style: "font-style",
      getAttrs(value) {
        if (typeof value !== "string") return false;
        return value === "italic" && null;
      },
    },
  ],
  toDOM() {
    return ["em", 0];
  },
};

const code_inline: MarkSpec = {
  priority: 100,
  code: true,
  inclusive: false,
  parseDOM: [{ tag: "code" }],
  toDOM() {
    return ["code", 0];
  },
};

const link: MarkSpec = {
  attrs: {
    href: { default: "" },
    title: { default: null },
    link_source: { default: null },
  },
  inclusive: false,
  parseDOM: [
    {
      tag: "a[href]",
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false;
        return {
          href: dom.getAttribute("href"),
          title: dom.getAttribute("title"),
          link_source: dom.getAttribute("data-link-source"),
        };
      },
    },
  ],
  toDOM(mark) {
    const attrs: Record<string, string> = {
      href: String(mark.attrs["href"] ?? ""),
    };
    if (typeof mark.attrs["title"] === "string") {
      attrs["title"] = mark.attrs["title"];
    }
    if (typeof mark.attrs["link_source"] === "string") {
      attrs["data-link-source"] = mark.attrs["link_source"];
    }
    return ["a", attrs, 0] as const;
  },
};

const strikethrough: MarkSpec = {
  inclusive: false,
  parseDOM: [
    { tag: "del" },
    { tag: "s" },
    {
      style: "text-decoration",
      getAttrs(value) {
        if (typeof value !== "string") return false;
        return value === "line-through" && null;
      },
    },
  ],
  toDOM() {
    return ["del", 0];
  },
};

const highlight: MarkSpec = {
  inclusive: false,
  parseDOM: [{ tag: "mark" }],
  toDOM() {
    return ["mark", 0];
  },
};

export const schema = new Schema({
  nodes: {
    doc,
    text: { group: "inline" },
    paragraph,
    heading,
    blockquote,
    code_block,
    hr: horizontal_rule,
    bullet_list,
    ordered_list,
    list_item,
    details_block,
    details_summary,
    details_content,
    excalidraw_embed,
    file_embed,
    "image-block": image_block,
    image,
    hardbreak,
    frontmatter,
    math_inline,
    math_block,
    table,
    table_header_row,
    table_row,
    table_header,
    table_cell,
  },
  marks: {
    strong,
    em,
    code_inline,
    link,
    strikethrough,
    highlight,
  },
});
