import type {
  Root,
  RootContent,
  Blockquote,
  Paragraph,
  Heading,
  PhrasingContent,
  Text,
} from "mdast";
import type { Plugin } from "unified";
import {
  CALLOUT_DIRECTIVE_RE,
  default_callout_title,
  format_callout_directive,
  parse_callout_directive,
  type CalloutType,
} from "$lib/features/editor/domain/callout";

function is_blockquote_callout(node: RootContent): node is Blockquote {
  if (node.type !== "blockquote") return false;
  const bq = node as Blockquote;
  const first_child = bq.children[0];
  if (
    !first_child ||
    (first_child.type !== "paragraph" && first_child.type !== "heading")
  )
    return false;
  const first_inline = (first_child as Paragraph | Heading).children[0];
  if (!first_inline || first_inline.type !== "text") return false;
  const text = (first_inline as Text).value;
  return CALLOUT_DIRECTIVE_RE.test(text.split("\n")[0] ?? "");
}

type MdastNode = Record<string, unknown> & { type: string };

function transform_blockquote_to_callout(bq: Blockquote): MdastNode {
  const first_block = bq.children[0] as Paragraph | Heading;
  const first_text = first_block.children[0] as Text;
  const lines = first_text.value.split("\n");
  const directive_line = lines[0] ?? "";

  const data = parse_callout_directive(directive_line);
  if (!data) return bq as unknown as MdastNode;

  const after_directive = first_block.children.slice(1);
  const title_line =
    lines.length === 1
      ? split_first_line(after_directive)
      : { line: [], rest: after_directive };

  const remaining_first_line = lines.slice(1).join("\n").trim();
  const remaining_para_children = title_line.rest;

  const body_children: RootContent[] = [];

  if (remaining_first_line || remaining_para_children.length > 0) {
    const new_inline: RootContent[] = [];
    if (remaining_first_line) {
      new_inline.push({ type: "text", value: remaining_first_line } as Text);
    }
    new_inline.push(...(remaining_para_children as RootContent[]));
    if (new_inline.length > 0) {
      body_children.push({
        type: "paragraph",
        children: new_inline,
        position: first_block.position,
      } as Paragraph);
    }
  }

  // Multi-line depth-2 heading = setext: a `---` divider line fused into the
  // directive as its underline. Re-insert it; ATX headings are single-line.
  const consumed_divider =
    first_block.type === "heading" &&
    first_block.depth === 2 &&
    (first_block.position?.end.line ?? 0) >
      (first_block.position?.start.line ?? 0);
  if (consumed_divider) {
    body_children.push({ type: "thematicBreak" } as RootContent);
  }

  body_children.push(...(bq.children.slice(1) as RootContent[]));

  const callout_body =
    body_children.length > 0
      ? body_children
      : [{ type: "paragraph", children: [{ type: "text", value: "" }] }];

  return {
    type: "callout",
    data: {
      callout_type: data.callout_type,
      title: data.title,
      color: data.color,
      foldable: data.foldable,
      default_folded: data.default_folded,
    },
    children: [
      {
        type: "calloutTitle",
        children:
          title_line.line.length > 0
            ? [
                ...text_if_present(directive_title_head(directive_line)),
                ...title_line.line,
              ]
            : [{ type: "text", value: data.title }],
      },
      {
        type: "calloutBody",
        children: callout_body,
      },
    ],
  };
}

// Obsidian reads everything up to the first line end as the title, so inline
// nodes after the directive's own text (bold, code, links) belong to it too.
function split_first_line(nodes: PhrasingContent[]): {
  line: PhrasingContent[];
  rest: PhrasingContent[];
} {
  for (const [i, node] of nodes.entries()) {
    if (node.type === "break") {
      return { line: nodes.slice(0, i), rest: nodes.slice(i + 1) };
    }
    const newline = node.type === "text" ? node.value.indexOf("\n") : -1;
    if (node.type === "text" && newline !== -1) {
      return {
        line: [
          ...nodes.slice(0, i),
          ...text_if_present(node.value.slice(0, newline)),
        ],
        rest: [
          ...text_if_present(node.value.slice(newline + 1)),
          ...nodes.slice(i + 1),
        ],
      };
    }
  }
  return { line: nodes, rest: [] };
}

function directive_title_head(directive_line: string): string {
  return (
    CALLOUT_DIRECTIVE_RE.exec(directive_line.trimStart())?.groups?.["title"] ??
    ""
  );
}

function text_if_present(value: string): Text[] {
  return value ? [{ type: "text", value }] : [];
}

// Only these mdast types hold block children we recurse through. A blanket
// "anything with children" walk would also reach paragraphs, whose inline
// `html` nodes are indistinguishable by type from block HTML.
const BLOCK_CONTAINERS = new Set([
  "blockquote",
  "callout",
  "calloutBody",
  "details",
  "detailsContent",
]);

function is_block_container(node: { type: string }): boolean {
  return BLOCK_CONTAINERS.has(node.type);
}

// The spread must preserve `position`: the setext-divider check above reads it
// off the blockquote's first child to tell an ATX heading from a fused `---`.
export function descend_block_container<T extends { type: string }, C>(
  node: T,
  transform: (children: C[]) => C[],
): T {
  if (!is_block_container(node)) return node;
  const children = (node as { children?: unknown }).children;
  if (!Array.isArray(children)) return node;
  return { ...node, children: transform(children as C[]) };
}

function transform_children(nodes: RootContent[]): RootContent[] {
  return nodes.map((node) => {
    // Descending first is safe: a blockquote's callout-ness depends only on its
    // first paragraph/heading child, which is never itself a block container.
    const descended = descend_block_container(node, transform_children);
    if (is_blockquote_callout(descended)) {
      return transform_blockquote_to_callout(
        descended,
      ) as unknown as RootContent;
    }
    return descended;
  });
}

export const remark_callout: Plugin<[], Root> = () => {
  return (tree: Root) => {
    tree.children = transform_children(tree.children);
  };
};

type StringifyState = {
  enter: (s: string) => () => void;
  containerPhrasing: (n: unknown, i: unknown) => string;
  containerFlow: (n: unknown, i: unknown) => string;
};

export const callout_to_markdown = {
  callout(
    node: {
      data?: {
        callout_type?: string;
        title?: string;
        color?: string | null;
        foldable?: boolean;
        default_folded?: boolean;
      };
      children: Array<{ children: unknown }>;
    },
    _parent: unknown,
    state: StringifyState,
    info: object,
  ): string {
    const d = node.data ?? {};
    const callout_type = d.callout_type || "note";
    const title_node = node.children[0];
    const title_markdown = title_node
      ? state
          .containerPhrasing(title_node, { ...info, before: " ", after: "\n" })
          .trim()
      : "";
    const title =
      title_markdown || d.title || default_callout_title(callout_type);
    const foldable = d.foldable ?? false;
    const default_folded = d.default_folded ?? false;

    const directive = format_callout_directive({
      callout_type: callout_type as CalloutType,
      title,
      color: d.color ?? null,
      foldable,
      default_folded,
    });

    const body_node = node.children[1];
    const body_str = body_node ? state.containerFlow(body_node, info) : "";

    const body_lines = body_str
      .split("\n")
      .map((line) => (line ? `> ${line}` : ">"))
      .join("\n");

    // A body starting with a `---`/`===` line would fuse with the directive
    // into a setext heading on re-parse; a bare `>` line keeps them apart.
    const needs_gap = /^ {0,3}(-+|=+)\s*$/.test(body_str.split("\n")[0] ?? "");

    return `> ${directive}\n${needs_gap ? ">\n" : ""}${body_lines}`;
  },
  calloutTitle(): string {
    return "";
  },
  calloutBody(): string {
    return "";
  },
};
