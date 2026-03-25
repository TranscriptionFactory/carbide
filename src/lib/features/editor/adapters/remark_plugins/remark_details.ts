import type { Root, RootContent } from "mdast";
import type { Plugin } from "unified";
import { unified } from "unified";
import remarkParse from "remark-parse";

const DETAILS_OPEN_RE = /^<details(\s[^>]*)?>$/i;
const DETAILS_OPEN_WITH_SUMMARY_RE =
  /^<details(\s[^>]*)?>\s*\n\s*<summary>([\s\S]*?)<\/summary>$/i;
const DETAILS_OPEN_INLINE_SUMMARY_RE =
  /^<details(\s[^>]*)?>\s*<summary>([\s\S]*?)<\/summary>$/i;
const DETAILS_CLOSE_RE = /^<\/details>\s*$/i;
const SUMMARY_STANDALONE_RE = /^\s*<summary>([\s\S]*?)<\/summary>\s*$/i;
const SELF_CONTAINED_RE = /^(<details(\s[^>]*)?>)([\s\S]*?)(<\/details>)\s*$/i;

function has_open_attr(tag: string): boolean {
  return /\bopen\b/i.test(tag);
}

function extract_summary_from_open_tag(value: string): string | null {
  const inline = DETAILS_OPEN_INLINE_SUMMARY_RE.exec(value);
  if (inline) return inline[2] ?? "Details";
  const multiline = DETAILS_OPEN_WITH_SUMMARY_RE.exec(value);
  if (multiline) return multiline[2] ?? "Details";
  return null;
}

function is_details_open_node(
  node: RootContent,
): node is RootContent & { type: "html"; value: string } {
  if (node.type !== "html") return false;
  const val = (node as { value: string }).value.trim();
  return (
    DETAILS_OPEN_RE.test(val) ||
    DETAILS_OPEN_INLINE_SUMMARY_RE.test(val) ||
    DETAILS_OPEN_WITH_SUMMARY_RE.test(val)
  );
}

function is_details_close_node(
  node: RootContent,
): node is RootContent & { type: "html"; value: string } {
  if (node.type !== "html") return false;
  return DETAILS_CLOSE_RE.test((node as { value: string }).value.trim());
}

function is_self_contained_details(
  node: RootContent,
): node is RootContent & { type: "html"; value: string } {
  if (node.type !== "html") return false;
  const val = (node as { value: string }).value.trim();
  return SELF_CONTAINED_RE.test(val);
}

function parse_markdown_body(markdown: string): RootContent[] {
  if (!markdown.trim()) return [];
  const p = unified().use(remarkParse);
  const tree = p.parse(markdown.trim());
  return tree.children as RootContent[];
}

function build_self_contained_details(value: string): MdastNode {
  const m = SELF_CONTAINED_RE.exec(value.trim());
  if (!m) return { type: "html", value };
  const open_tag = m[1] ?? "<details>";
  const inner = (m[3] ?? "").trim();
  const open_flag = has_open_attr(open_tag);

  let summary_text = "Details";
  let body_markdown = inner;

  const summary_m = inner.match(/^<summary>([\s\S]*?)<\/summary>([\s\S]*)$/i);
  if (summary_m) {
    summary_text = summary_m[1] ?? "Details";
    body_markdown = (summary_m[2] ?? "").trim();
  }

  const body_nodes = parse_markdown_body(body_markdown);
  const processed = transform_children(body_nodes as MdastNode[]);

  const empty_para: MdastNode = {
    type: "paragraph",
    children: [{ type: "text", value: "" }],
  };

  return {
    type: "details",
    data: { open: open_flag },
    children: [
      {
        type: "detailsSummary",
        children: [{ type: "text", value: summary_text }],
      },
      {
        type: "detailsContent",
        children: processed.length > 0 ? processed : [empty_para],
      },
    ],
  };
}

type MdastNode = Record<string, unknown> & { type: string };

function build_details_node(
  open_value: string,
  content_nodes: RootContent[],
): MdastNode {
  const open_flag = has_open_attr(open_value);
  let summary_text = "Details";
  let body_nodes = content_nodes;

  const extracted = extract_summary_from_open_tag(open_value);
  if (extracted !== null) {
    summary_text = extracted;
  } else if (content_nodes.length > 0 && content_nodes[0]?.type === "html") {
    const first_html = content_nodes[0] as { value: string };
    const m = SUMMARY_STANDALONE_RE.exec(first_html.value.trim());
    if (m) {
      summary_text = m[1] ?? "Details";
      body_nodes = content_nodes.slice(1);
    }
  }

  const processed_children = transform_children(body_nodes as MdastNode[]);

  const empty_para: MdastNode = {
    type: "paragraph",
    children: [{ type: "text", value: "" }],
  };

  return {
    type: "details",
    data: { open: open_flag },
    children: [
      {
        type: "detailsSummary",
        children: [{ type: "text", value: summary_text }],
      },
      {
        type: "detailsContent",
        children:
          processed_children.length > 0 ? processed_children : [empty_para],
      },
    ],
  };
}

function transform_children(nodes: MdastNode[]): MdastNode[] {
  const result: MdastNode[] = [];
  let i = 0;

  while (i < nodes.length) {
    const node = nodes[i];
    if (!node) break;

    if (is_self_contained_details(node as unknown as RootContent)) {
      result.push(
        build_self_contained_details(
          (node as unknown as { value: string }).value,
        ),
      );
      i++;
      continue;
    }

    if (is_details_open_node(node as unknown as RootContent)) {
      const open_value = (node as unknown as { value: string }).value;
      const collected: MdastNode[] = [];
      let depth = 1;
      i++;

      while (i < nodes.length && depth > 0) {
        const current = nodes[i];
        if (!current) break;
        if (is_self_contained_details(current as unknown as RootContent)) {
          if (depth === 1) {
            collected.push(current);
          } else {
            collected.push(current);
          }
          i++;
          continue;
        }
        if (is_details_open_node(current as unknown as RootContent)) {
          depth++;
          collected.push(current);
        } else if (is_details_close_node(current as unknown as RootContent)) {
          depth--;
          if (depth > 0) collected.push(current);
        } else {
          collected.push(current);
        }
        i++;
      }

      result.push(
        build_details_node(open_value, collected as unknown as RootContent[]),
      );
    } else {
      result.push(node);
      i++;
    }
  }

  return result;
}

export const remark_details: Plugin<[], Root> = () => {
  return (tree: Root) => {
    const new_children = transform_children(
      tree.children as unknown as MdastNode[],
    );
    tree.children = new_children as unknown as RootContent[];
  };
};

export const details_to_markdown = {
  details(
    node: { data?: { open?: boolean }; children: Array<{ children: unknown }> },
    _parent: unknown,
    state: {
      enter: (s: string) => () => void;
      containerPhrasing: (n: unknown, i: unknown) => string;
      containerFlow: (n: unknown, i: unknown) => string;
    },
    info: unknown,
  ): string {
    const open_attr = node.data?.open ? " open" : "";
    const summary = node.children[0];
    const content = node.children[1];
    const summary_text = summary
      ? state.containerPhrasing(summary, info)
      : "Details";
    const content_str = content ? state.containerFlow(content, info) : "";
    return `<details${open_attr}>\n<summary>${summary_text}</summary>\n\n${content_str}\n\n</details>`;
  },
  detailsSummary(): string {
    return "";
  },
  detailsContent(): string {
    return "";
  },
};
