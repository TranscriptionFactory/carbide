import { split_image_alt_width } from "../domain/image_size";
import type { Root } from "mdast";
import type { Node as PmNode, Mark } from "prosemirror-model";
import { schema } from "./schema";
import {
  detect_embed_type,
  parse_embed_fragment,
  split_wiki_embed_options,
  type WikiEmbedOptions,
} from "./file_embed_plugin";
import {
  fence_height_from_meta,
  meta_has_token,
  set_fence_height_token,
  set_meta_token,
} from "./code_preview";
import { format_footnote_ref } from "$lib/features/editor/domain/footnotes";

type AnyMdastNode = Record<string, unknown> & { type: string };

const NEXT_LINE_NOT_BLANK_RE = /\r?\n[ \t]*\S/y;

let current_source = "";
let current_inline_indent = 0;
let next_html_pair_key = 0;

function source_indent(node: AnyMdastNode): number {
  const column = (node.position as { start?: { column?: number } } | undefined)
    ?.start?.column;
  return typeof column === "number" ? column - 1 : 0;
}

// The block's first-line column is the width of its container prefixes
// (`> `, list indentation); continuation lines repeat them and serialize
// re-adds them, so keeping them would compound on every save.
function strip_container_prefixes(raw: string, indent: number): string {
  if (indent === 0) return raw;
  return raw.replace(new RegExp(`\\n[ \\t>]{0,${String(indent)}}`, "g"), "\n");
}

function slice_source(
  node: AnyMdastNode,
  indent = source_indent(node),
): string {
  const position = node.position as
    | { start?: { offset?: number }; end?: { offset?: number } }
    | undefined;
  const start = position?.start?.offset;
  const end = position?.end?.offset;
  if (typeof start !== "number" || typeof end !== "number") return "";
  return strip_container_prefixes(current_source.slice(start, end), indent);
}

function create_raw_block(value: string): PmNode | null {
  if (!value) return null;
  return schema.nodes.raw_block.create(null, schema.text(value));
}

function create_raw_inline(value: string, marks: Mark[]): PmNode {
  return schema.nodes.raw_inline.create(
    { value },
    null,
    marks.length > 0 ? marks : undefined,
  );
}

function is_empty_link(node: AnyMdastNode): boolean {
  const children = node.children as AnyMdastNode[] | undefined;
  return !children || children.length === 0;
}

function create_footnote_ref(node: AnyMdastNode, marks: Mark[]): PmNode {
  const label = (node.label as string) || (node.identifier as string) || "";
  return schema.nodes.footnote_ref.create(
    { label, raw: slice_source(node) || format_footnote_ref(label) },
    null,
    marks.length > 0 ? marks : undefined,
  );
}

function is_followed_by_line(node: AnyMdastNode): boolean {
  const end = (node.position as { end?: { offset?: number } } | undefined)?.end
    ?.offset;
  if (typeof end !== "number") return false;
  NEXT_LINE_NOT_BLANK_RE.lastIndex = end;
  return NEXT_LINE_NOT_BLANK_RE.test(current_source);
}

function create_footnote_def(node: AnyMdastNode): PmNode | null {
  const raw = slice_source(node);
  if (!raw) return null;
  return schema.nodes.footnote_def.create(
    { tight: is_followed_by_line(node) },
    schema.text(raw),
  );
}

// `key` keeps adjacent pairs with identical tags from merging into one.
function create_html_inline_mark(node: AnyMdastNode): Mark {
  return schema.marks.html_inline.create({
    open: node.open as string,
    close: node.close as string,
    inner: node.inner === true,
    key: next_html_pair_key++,
  });
}

function flatten_inline(
  nodes: AnyMdastNode[],
  marks: Mark[],
  result: PmNode[],
): void {
  for (const node of nodes) {
    switch (node.type) {
      case "text": {
        const val = node.value as string;
        if (val) result.push(schema.text(val, marks.length > 0 ? marks : null));
        break;
      }
      case "emphasis":
        flatten_inline(
          (node.children as AnyMdastNode[]) || [],
          [...marks, schema.marks.em.create()],
          result,
        );
        break;
      case "strong":
        flatten_inline(
          (node.children as AnyMdastNode[]) || [],
          [...marks, schema.marks.strong.create()],
          result,
        );
        break;
      case "delete":
        flatten_inline(
          (node.children as AnyMdastNode[]) || [],
          [...marks, schema.marks.strikethrough.create()],
          result,
        );
        break;
      case "link":
        if (is_empty_link(node)) {
          const raw = slice_source(node, current_inline_indent);
          if (raw) result.push(create_raw_inline(raw, marks));
          break;
        }
        flatten_inline(
          (node.children as AnyMdastNode[]) || [],
          [
            ...marks,
            schema.marks.link.create({
              href: (node.url as string) || "",
              title: (node.title as string | null) || null,
              link_source: "markdown",
            }),
          ],
          result,
        );
        break;
      case "inlineCode":
        result.push(
          schema.text(node.value as string, [
            ...marks,
            schema.marks.code_inline.create(),
          ]),
        );
        break;
      case "image":
        result.push(
          schema.nodes.image.create(
            {
              src: (node.url as string) || "",
              ...split_image_alt_width((node.alt as string) || ""),
              title: (node.title as string) || "",
            },
            null,
            schema.nodes.image.allowedMarks(marks),
          ),
        );
        break;
      case "break":
        result.push(
          schema.nodes.hardbreak.create(
            null,
            null,
            marks.length > 0 ? marks : undefined,
          ),
        );
        break;
      case "inlineMath": {
        const val = node.value as string;
        result.push(
          schema.nodes.math_inline.create(
            null,
            val ? schema.text(val) : undefined,
          ),
        );
        break;
      }
      case "highlight":
        flatten_inline(
          (node.children as AnyMdastNode[]) || [],
          [...marks, schema.marks.highlight.create()],
          result,
        );
        break;
      case "html": {
        const html_val = (node.value as string) || "";
        if (html_val) result.push(create_raw_inline(html_val, marks));
        break;
      }
      case "footnoteReference":
        result.push(create_footnote_ref(node, marks));
        break;
      case "inlineHtml":
        flatten_inline(
          (node.children as AnyMdastNode[]) || [],
          [...marks, create_html_inline_mark(node)],
          result,
        );
        break;
      default: {
        const raw = slice_source(node, current_inline_indent);
        if (raw) result.push(create_raw_inline(raw, marks));
        break;
      }
    }
  }
}

function convert_inline(parent: AnyMdastNode): PmNode[] {
  const result: PmNode[] = [];
  current_inline_indent = source_indent(parent);
  next_html_pair_key = 0;
  flatten_inline((parent.children as AnyMdastNode[]) || [], [], result);
  return result;
}

function convert_block(
  node: AnyMdastNode,
  source_blocks?: Map<number, PmNode>,
): PmNode | null {
  const result = build_block(node, source_blocks);
  const line = (node.position as { start?: { line?: number } } | undefined)
    ?.start?.line;
  if (result?.isTextblock && line !== undefined)
    source_blocks?.set(line - 1, result);
  return result;
}

function build_block(
  node: AnyMdastNode,
  source_blocks?: Map<number, PmNode>,
): PmNode | null {
  switch (node.type) {
    case "paragraph": {
      const inline = convert_inline(node);
      if (inline.length === 0) {
        return schema.nodes.paragraph.create();
      }
      return schema.nodes.paragraph.create(null, inline);
    }

    case "heading": {
      const inline = convert_inline(node);
      return schema.nodes.heading.create(
        { level: (node.depth as number) || 1 },
        inline.length > 0 ? inline : undefined,
      );
    }

    case "blockquote": {
      const children = convert_blocks(
        node.children as AnyMdastNode[],
        source_blocks,
      );
      return schema.nodes.blockquote.create(null, children);
    }

    case "code": {
      let lang = (node.lang as string) || "";
      const raw_meta = (node.meta as string) || "";
      // A language-less collapsed block stores its flag in the lang slot
      // (remark can't emit fence meta without a language). Decode it back.
      let collapsed = meta_has_token(raw_meta, "collapsed");
      if (lang === "collapsed" && !raw_meta) {
        collapsed = true;
        lang = "";
      }
      const height = fence_height_from_meta(raw_meta);
      const without_collapsed = set_meta_token(raw_meta, "collapsed", false);
      const meta =
        height === null
          ? without_collapsed
          : set_fence_height_token(without_collapsed, null);
      const val = (node.value as string) || "";
      return schema.nodes.code_block.create(
        { language: lang, meta, collapsed, height },
        val ? schema.text(val) : undefined,
      );
    }

    case "thematicBreak":
      return schema.nodes.hr.create();

    case "list": {
      const items = (node.children as AnyMdastNode[]).map((item) =>
        convert_list_item(item, source_blocks),
      );
      if (node.ordered) {
        return schema.nodes.ordered_list.create(
          { order: (node.start as number) || 1 },
          items,
        );
      }
      return schema.nodes.bullet_list.create(null, items);
    }

    case "table": {
      return convert_table(node);
    }

    case "yaml": {
      const val = (node.value as string) || "";
      return schema.nodes.frontmatter.create(
        null,
        val ? schema.text(val) : undefined,
      );
    }

    case "math": {
      const val = (node.value as string) || "";
      return schema.nodes.math_block.create({ value: val });
    }

    case "details": {
      return convert_details(node, source_blocks);
    }

    case "callout": {
      return convert_callout(node, source_blocks);
    }

    case "wikiEmbed": {
      return convert_wiki_embed(node);
    }

    case "embed": {
      return schema.nodes.web_embed.create({
        src: (node.url as string) || "",
        title: (node.title as string) || "",
        width: (node.width as string) || "",
        height: (node.height as string) || "",
        align: (node.align as string) || "center",
      });
    }

    case "video": {
      return schema.nodes.video.create({
        src: (node.url as string) || "",
        poster: (node.poster as string) || "",
        width: (node.width as string) || "",
        height: (node.height as string) || "",
        controls: Boolean(node.controls),
        autoplay: Boolean(node.autoplay),
        loop: Boolean(node.loop),
        muted: Boolean(node.muted),
      });
    }

    case "html": {
      return create_raw_block((node.value as string) || "");
    }

    case "footnoteDefinition": {
      return create_footnote_def(node);
    }

    case "commentBlock": {
      const val = (node.value as string) || "";
      return schema.nodes.comment_block.create(
        null,
        val ? schema.text(val) : undefined,
      );
    }

    default:
      return create_raw_block(slice_source(node));
  }
}

const WIKI_EMBED_PARSE_RE = /^!\[\[([^\]\n]+?)\]\]$/;
const EXCALIDRAW_EXT_RE = /\.(?:excalidraw|canvas)$/i;
const MD_EXT_RE = /\.md$/i;
const FILE_EXT_RE = /\.[a-zA-Z0-9]+$/;

function embed_target(inner: string): string {
  const hash_idx = inner.indexOf("#");
  return hash_idx >= 0 ? inner.slice(0, hash_idx) : inner;
}

function is_note_target(target: string): boolean {
  return MD_EXT_RE.test(target) || !FILE_EXT_RE.test(target);
}

// `|height=N` belongs to note and drawing embeds only; on a file embed the
// whole `|…` tail stays part of the target, as it always has.
function read_embed_options(raw: string): WikiEmbedOptions {
  const options = split_wiki_embed_options(raw);
  if (options.height === null) return options;
  const target = embed_target(options.inner);
  if (EXCALIDRAW_EXT_RE.test(target) || is_note_target(target)) return options;
  const collapsed = raw.endsWith("|collapsed");
  const inner = collapsed ? raw.slice(0, -"|collapsed".length) : raw;
  return { inner, collapsed, height: null };
}

function convert_wiki_embed(node: AnyMdastNode): PmNode | null {
  const raw = (node.value as string) || "";
  const match = WIKI_EMBED_PARSE_RE.exec(raw);
  if (!match || !match[1]) return null;

  const { inner, collapsed, height } = read_embed_options(match[1]);
  const target = embed_target(inner);
  const fragment = inner.slice(target.length + 1);

  if (EXCALIDRAW_EXT_RE.test(target)) {
    return schema.nodes.excalidraw_embed.create({ src: target, height });
  }

  if (is_note_target(target)) {
    const src = MD_EXT_RE.test(target) ? target : `${target}.md`;
    const display_src = fragment ? `${target}#${fragment}` : target;
    return schema.nodes.note_embed.create({
      src,
      fragment: fragment || null,
      display_src,
      collapsed,
      height,
    });
  }

  const file_type = detect_embed_type(target);
  const parsed = parse_embed_fragment(fragment);
  return schema.nodes.file_embed.create({
    src: target,
    file_type,
    page: parsed.page,
    height: parsed.height ?? 400,
    params: parsed.params,
  });
}

// Schema `list_item` is `paragraph block*`; an item led by another block gets
// an empty paragraph that pm_to_mdast drops again.
function starts_with_paragraph(children: AnyMdastNode[]): boolean {
  const type = children[0]?.type;
  return type === "paragraph" || type === "wikiEmbed";
}

function convert_list_item(
  node: AnyMdastNode,
  source_blocks?: Map<number, PmNode>,
): PmNode {
  const checked =
    node.checked !== undefined && node.checked !== null
      ? (node.checked as boolean)
      : null;

  const children_nodes = node.children as AnyMdastNode[];
  const pm_children = convert_blocks(children_nodes, source_blocks);
  if (pm_children.length === 0 || !starts_with_paragraph(children_nodes)) {
    pm_children.unshift(schema.nodes.paragraph.create());
  }

  const doing_from_data =
    (node.data as Record<string, unknown> | undefined)?.taskStatus === "doing";
  const task_status = doing_from_data
    ? "doing"
    : checked === true
      ? "done"
      : checked === false
        ? "todo"
        : null;
  return schema.nodes.list_item.create({ checked, task_status }, pm_children);
}

function convert_table(node: AnyMdastNode): PmNode {
  const rows = node.children as AnyMdastNode[];
  const align = (node.align as Array<string | null>) || [];
  const pm_rows: PmNode[] = [];

  rows.forEach((row, row_index) => {
    const cells = row.children as AnyMdastNode[];
    const pm_cells: PmNode[] = [];

    cells.forEach((cell, col_index) => {
      const col_align = align[col_index] || null;
      const cell_inline = convert_inline(cell);
      const cell_para = schema.nodes.paragraph.create(
        null,
        cell_inline.length > 0 ? cell_inline : undefined,
      );

      if (row_index === 0) {
        pm_cells.push(
          schema.nodes.table_header.create({ alignment: col_align || "left" }, [
            cell_para,
          ]),
        );
      } else {
        pm_cells.push(
          schema.nodes.table_cell.create({ alignment: col_align || "left" }, [
            cell_para,
          ]),
        );
      }
    });

    pm_rows.push(schema.nodes.table_row.create(null, pm_cells));
  });

  const layout =
    (node.data as { layout?: string })?.layout === "fixed" ? "fixed" : "auto";
  return schema.nodes.table.create({ layout }, pm_rows);
}

function convert_details(
  node: AnyMdastNode,
  source_blocks?: Map<number, PmNode>,
): PmNode {
  const open = (node.data as { open?: boolean })?.open || false;
  const children = node.children as AnyMdastNode[];

  const summary_node = children[0];
  const content_node = children[1];

  const summary_inline = summary_node ? convert_inline(summary_node) : [];
  const pm_summary = schema.nodes.details_summary.create(
    null,
    summary_inline.length > 0 ? summary_inline : undefined,
  );

  let content_children: PmNode[] = [];
  if (content_node) {
    content_children = convert_blocks(
      content_node.children as AnyMdastNode[],
      source_blocks,
    );
  }
  if (content_children.length === 0) {
    content_children = [schema.nodes.paragraph.create()];
  }

  const pm_content = schema.nodes.details_content.create(
    null,
    content_children,
  );

  return schema.nodes.details_block.create({ open }, [pm_summary, pm_content]);
}

function convert_callout(
  node: AnyMdastNode,
  source_blocks?: Map<number, PmNode>,
): PmNode {
  const data =
    (node.data as {
      callout_type?: string;
      title?: string;
      color?: string | null;
      foldable?: boolean;
      default_folded?: boolean;
    }) ?? {};
  const children = node.children as AnyMdastNode[];

  const title_node = children[0];
  const body_node = children[1];

  const title_inline = title_node ? convert_inline(title_node) : [];
  const pm_title = schema.nodes.callout_title.create(
    null,
    title_inline.length > 0 ? title_inline : undefined,
  );

  let body_children: PmNode[] = [];
  if (body_node) {
    body_children = convert_blocks(
      body_node.children as AnyMdastNode[],
      source_blocks,
    );
  }
  if (body_children.length === 0) {
    body_children = [schema.nodes.paragraph.create()];
  }

  const pm_body = schema.nodes.callout_body.create(null, body_children);

  return schema.nodes.callout.create(
    {
      callout_type: data.callout_type || "note",
      callout_color: data.color ?? null,
      foldable: data.foldable ?? false,
      default_folded: data.default_folded ?? false,
      folded: data.default_folded ?? false,
    },
    [pm_title, pm_body],
  );
}

function convert_blocks(
  nodes: AnyMdastNode[],
  source_blocks?: Map<number, PmNode>,
): PmNode[] {
  const result: PmNode[] = [];
  for (const node of nodes) {
    const pm = convert_block(node, source_blocks);
    if (pm) result.push(pm);
  }
  return result;
}

export function mdast_to_pm(
  tree: Root,
  source = "",
  source_blocks?: Map<number, PmNode>,
): PmNode {
  current_source = source;
  const children = tree.children as unknown as AnyMdastNode[];
  const pm_children = convert_blocks(children, source_blocks);

  const has_frontmatter =
    pm_children.length > 0 && pm_children[0]?.type.name === "frontmatter";
  const has_body = pm_children.length > (has_frontmatter ? 1 : 0);

  if (has_frontmatter && !has_body) {
    pm_children.push(schema.nodes.paragraph.create());
  }

  if (pm_children.length === 0) {
    pm_children.push(schema.nodes.paragraph.create());
  }

  return schema.nodes.doc.create(null, pm_children);
}
