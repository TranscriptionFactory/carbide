import MarkdownIt from "markdown-it";
import type { PluginSimple, PluginWithOptions } from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import texmathPlugin from "markdown-it-texmath";
import frontmatterPlugin from "markdown-it-front-matter";
import { MarkdownParser, MarkdownSerializer } from "prosemirror-markdown";
import type { MarkdownSerializerState, ParseSpec } from "prosemirror-markdown";
import type { Node as PmNode, Mark, Schema, NodeType } from "prosemirror-model";
import { schema } from "./schema";

type ParseStateInternal = {
  openNode(
    type: NodeType | undefined,
    attrs: Record<string, unknown> | null,
  ): void;
  closeNode(): void;
};

type SerializerStateInternal = {
  out: string;
  closed: unknown;
};

let captured_frontmatter = "";

const md = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
})
  .enable(["table", "strikethrough"])
  .use(texmathPlugin as PluginSimple)
  .use(
    frontmatterPlugin as PluginWithOptions<(fm: string) => void>,
    (fm: string) => {
      captured_frontmatter = fm;
    },
  );

const parser_tokens: Record<string, ParseSpec> = {
  paragraph: { block: "paragraph" },
  blockquote: { block: "blockquote" },
  heading: {
    block: "heading",
    getAttrs(token) {
      return { level: Number(token.tag.slice(1)) };
    },
  },
  hr: { node: "hr" },
  bullet_list: { block: "bullet_list" },
  ordered_list: {
    block: "ordered_list",
    getAttrs(token) {
      return { order: Number(token.attrGet("start") || 1) };
    },
  },
  list_item: {
    block: "list_item",
    getAttrs(_token, tokens, index) {
      let checked: boolean | null = null;
      for (let i = index + 1; i < tokens.length; i++) {
        const t = tokens[i];
        if (!t) break;
        if (t.type === "inline" && t.content) {
          const match = t.content.match(/^\[( |x|X)\]\s?/);
          if (match) {
            checked = match[1] !== " ";
            t.content = t.content.slice(match[0].length);
            if (t.children && t.children.length > 0) {
              const first_child = t.children[0];
              if (first_child && first_child.type === "text") {
                first_child.content = first_child.content.slice(
                  match[0].length,
                );
                if (!first_child.content) {
                  t.children.shift();
                }
              }
            }
          }
          break;
        }
        if (t.type === "list_item_close") break;
      }
      return { checked };
    },
  },
  code_block: {
    block: "code_block",
    getAttrs() {
      return { language: "" };
    },
    noCloseToken: true,
  },
  fence: {
    block: "code_block",
    getAttrs(token) {
      return { language: token.info.trim() || "" };
    },
    noCloseToken: true,
  },

  front_matter: { ignore: true, noCloseToken: true },
  table: { block: "table" },
  thead: { ignore: true },
  tbody: { ignore: true },

  math_inline: {
    node: "math_inline",
    noCloseToken: true,
    getAttrs(token) {
      return { __text: token.content };
    },
  },
  math_block: {
    node: "math_block",
    noCloseToken: true,
    getAttrs(token) {
      return { value: token.content.trim() };
    },
  },

  image: {
    node: "image",
    getAttrs(token) {
      return {
        src: token.attrGet("src") || "",
        alt: (token.children || []).map((c) => c.content).join("") || "",
        title: token.attrGet("title") || "",
      };
    },
  },
  hardbreak: { node: "hardbreak" },
  softbreak: { node: "hardbreak" },

  em: { mark: "em" },
  strong: { mark: "strong" },
  s: { mark: "strikethrough" },
  code_inline: { mark: "code_inline", noCloseToken: true },
  link: {
    mark: "link",
    getAttrs(token) {
      return {
        href: token.attrGet("href") || "",
        title: token.attrGet("title") || null,
        link_source: "markdown",
      };
    },
  },
};

class CarbideMarkdownParser extends MarkdownParser {
  constructor(target_schema: Schema) {
    super(target_schema, md, parser_tokens);

    const h: Record<
      string,
      (
        state: ParseStateInternal,
        tok: Token,
        tokens: Token[],
        i: number,
      ) => void
    > = (
      this as unknown as {
        tokenHandlers: Record<
          string,
          (
            state: ParseStateInternal,
            tok: Token,
            tokens: Token[],
            i: number,
          ) => void
        >;
      }
    ).tokenHandlers;

    function cell_alignment(tok: {
      attrGet(s: string): string | null;
    }): string {
      const style = tok.attrGet("style") || "";
      const m = style.match(/text-align:\s*(\w+)/);
      return m?.[1] ?? "left";
    }

    h["tr_open"] = (state, _tok, tokens, i) => {
      let in_thead = false;
      for (let j = i - 1; j >= 0; j--) {
        const t = tokens[j];
        if (!t) break;
        if (t.type === "thead_open") {
          in_thead = true;
          break;
        }
        if (t.type === "thead_close" || t.type === "tbody_open") break;
      }
      state.openNode(
        in_thead
          ? target_schema.nodes["table_header_row"]
          : target_schema.nodes["table_row"],
        null,
      );
    };
    h["tr_close"] = (state) => {
      state.closeNode();
    };

    h["th_open"] = (state, tok) => {
      state.openNode(target_schema.nodes["table_header"], {
        alignment: cell_alignment(tok),
      });
      state.openNode(target_schema.nodes["paragraph"], null);
    };
    h["th_close"] = (state) => {
      state.closeNode();
      state.closeNode();
    };

    h["td_open"] = (state, tok) => {
      state.openNode(target_schema.nodes["table_cell"], {
        alignment: cell_alignment(tok),
      });
      state.openNode(target_schema.nodes["paragraph"], null);
    };
    h["td_close"] = (state) => {
      state.closeNode();
      state.closeNode();
    };
  }
}

const parser_instance = new CarbideMarkdownParser(schema);

function is_plain_url(
  mark: Mark,
  parent: PmNode,
  index: number,
  side: number,
): boolean {
  if (mark.attrs["title"] || !/^\w+:/.test(mark.attrs["href"] as string))
    return false;
  const content = parent.child(index + (side < 0 ? -1 : 0));
  if (
    !content.isText ||
    content.text !== mark.attrs["href"] ||
    content.marks[content.marks.length - 1] !== mark
  ) {
    return false;
  }
  if (index === (side < 0 ? 1 : parent.childCount - 1)) return true;
  const next = parent.child(index + (side < 0 ? -2 : 1));
  return !mark.isInSet(next.marks);
}

function render_table_row(state: MarkdownSerializerState, row: PmNode) {
  const cells: string[] = [];
  const s = state as unknown as SerializerStateInternal;
  row.forEach((cell) => {
    const parts: string[] = [];
    cell.forEach((para) => {
      if (para.type.name !== "paragraph") return;
      const saved_out = s.out;
      const saved_closed = s.closed;
      s.out = "";
      s.closed = null;
      state.renderInline(para);
      const piece = s.out.replace(/\n/g, " ").trim();
      s.out = saved_out;
      s.closed = saved_closed;
      parts.push(piece);
    });
    cells.push(parts.join(" "));
  });
  state.write(`| ${cells.join(" | ")} |`);
  state.ensureNewLine();
}

const serializer = new MarkdownSerializer(
  {
    doc(state, node) {
      state.renderContent(node);
    },
    paragraph(state, node) {
      state.renderInline(node);
      state.closeBlock(node);
    },
    heading(state, node) {
      state.write(`${"#".repeat(node.attrs["level"] as number)} `);
      state.renderInline(node);
      state.closeBlock(node);
    },
    blockquote(state, node) {
      state.wrapBlock("> ", null, node, () => {
        state.renderContent(node);
      });
    },
    code_block(state, node) {
      const lang = (node.attrs["language"] as string) || "";
      state.write(`\`\`\`${lang}\n`);
      state.text(node.textContent, false);
      state.ensureNewLine();
      state.write("```");
      state.closeBlock(node);
    },
    hr(state, node) {
      state.write("---");
      state.closeBlock(node);
    },
    bullet_list(state, node) {
      state.renderList(node, "  ", () => "- ");
    },
    ordered_list(state, node) {
      const start = (node.attrs["order"] as number) || 1;
      state.renderList(node, "   ", (i: number) => `${String(start + i)}. `);
    },
    list_item(state, node) {
      if (node.attrs["checked"] != null) {
        const checkbox = node.attrs["checked"] ? "[x] " : "[ ] ";
        state.write(checkbox);
      }
      state.renderContent(node);
    },
    "image-block": function image_block_serializer(state, node) {
      const alt = state.esc(
        (node.attrs["alt"] as string) ||
          (node.attrs["caption"] as string) ||
          "",
        false,
      );
      const src = (node.attrs["src"] as string) || "";
      const title = node.attrs["title"] as string | null;
      if (title) {
        state.write(`![${alt}](${src} "${state.esc(title, false)}")`);
      } else {
        state.write(`![${alt}](${src})`);
      }
      state.closeBlock(node);
    },
    image(state, node) {
      const alt = state.esc((node.attrs["alt"] as string) || "", false);
      const src = (node.attrs["src"] as string) || "";
      const title = node.attrs["title"] as string | null;
      if (title) {
        state.write(`![${alt}](${src} "${state.esc(title, false)}")`);
      } else {
        state.write(`![${alt}](${src})`);
      }
    },
    hardbreak(state) {
      state.write("  \n");
    },
    frontmatter(state, node) {
      state.write("---\n");
      state.text(node.textContent, false);
      state.ensureNewLine();
      state.write("---");
      state.closeBlock(node);
    },
    math_inline(state, node) {
      state.write(`$${node.textContent}$`);
    },
    math_block(state, node) {
      state.write("$$\n");
      state.text((node.attrs["value"] as string) || node.textContent, false);
      state.ensureNewLine();
      state.write("$$");
      state.closeBlock(node);
    },
    table(state, node) {
      const alignments: string[] = [];
      const header_row = node.child(0);
      header_row.forEach((cell) => {
        alignments.push((cell.attrs["alignment"] as string) || "left");
      });

      render_table_row(state, header_row);

      const sep = alignments.map((a) => {
        switch (a) {
          case "center":
            return ":---:";
          case "right":
            return "---:";
          default:
            return "---";
        }
      });
      state.write(`| ${sep.join(" | ")} |`);
      state.ensureNewLine();

      for (let i = 1; i < node.childCount; i++) {
        render_table_row(state, node.child(i));
      }
      state.closeBlock(node);
    },
    table_header_row() {},
    table_row() {},
    table_header(state, node) {
      if (node.firstChild) state.renderInline(node.firstChild);
    },
    table_cell(state, node) {
      if (node.firstChild) state.renderInline(node.firstChild);
    },
    text(state, node) {
      state.text(node.text || "");
    },
  },
  {
    strong: {
      open: "**",
      close: "**",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    em: {
      open: "*",
      close: "*",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    code_inline: {
      open(
        _state: MarkdownSerializerState,
        _mark: Mark,
        parent: PmNode,
        index: number,
      ) {
        return is_plain_url(_mark, parent, index, 1) ? "" : "`";
      },
      close(
        _state: MarkdownSerializerState,
        _mark: Mark,
        parent: PmNode,
        index: number,
      ) {
        return is_plain_url(_mark, parent, index, -1) ? "" : "`";
      },
      escape: false,
    },
    link: {
      open(state, mark, parent, index) {
        return is_plain_url(mark, parent, index, 1) ? "<" : "[";
      },
      close(state, mark, parent, index) {
        const { href, title } = mark.attrs as {
          href: string;
          title: string | null;
        };
        if (is_plain_url(mark, parent, index, -1)) {
          return ">";
        }
        return title ? `](${href} "${state.esc(title, false)}")` : `](${href})`;
      },
      mixable: false,
    },
    strikethrough: {
      open: "~~",
      close: "~~",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
  },
  {
    hardBreakNodeName: "hardbreak",
    strict: false,
  },
);

export function parse_markdown(markdown: string): PmNode {
  captured_frontmatter = "";
  const doc = parser_instance.parse(markdown);
  if (!doc) throw new Error("Markdown parser returned null");

  if (captured_frontmatter) {
    const frontmatter_type = schema.nodes["frontmatter"];
    const doc_type = schema.nodes["doc"];
    if (!frontmatter_type || !doc_type) return doc;
    const fm_node = frontmatter_type.create(
      null,
      captured_frontmatter ? schema.text(captured_frontmatter) : undefined,
    );
    const new_content = [fm_node];
    doc.forEach((child) => new_content.push(child));
    return doc_type.create(null, new_content);
  }

  return doc;
}

export function serialize_markdown(doc: PmNode): string {
  return serializer.serialize(doc, { tightLists: true });
}

export { schema };
