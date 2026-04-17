import type { Root, RootContent, Blockquote, Paragraph, Text } from "mdast";
import type { Plugin } from "unified";

export const CALLOUT_TYPES = [
  "note",
  "abstract",
  "summary",
  "tldr",
  "info",
  "todo",
  "tip",
  "hint",
  "important",
  "success",
  "check",
  "done",
  "question",
  "help",
  "faq",
  "warning",
  "caution",
  "attention",
  "failure",
  "fail",
  "missing",
  "danger",
  "error",
  "bug",
  "example",
  "quote",
  "cite",
] as const;

export type CalloutType = (typeof CALLOUT_TYPES)[number];

const CALLOUT_TYPE_SET = new Set<string>(CALLOUT_TYPES);

const CALLOUT_DIRECTIVE_RE =
  /^\[!(?<type>[^\]]+)\](?<fold>[+-])?(?:\s+(?<title>.*))?$/;

export type CalloutData = {
  callout_type: CalloutType;
  title: string;
  foldable: boolean;
  default_folded: boolean;
};

const CANONICAL_TYPE: Record<string, CalloutType> = {
  summary: "abstract",
  tldr: "abstract",
  hint: "tip",
  check: "success",
  done: "success",
  help: "question",
  faq: "question",
  caution: "warning",
  attention: "warning",
  fail: "failure",
  missing: "failure",
  error: "danger",
  cite: "quote",
};

export function normalize_callout_type(raw: string): CalloutType {
  const lower = raw.trim().toLowerCase();
  if (CALLOUT_TYPE_SET.has(lower)) return lower as CalloutType;
  return "note";
}

export function canonical_callout_type(raw: string): CalloutType {
  const normalized = normalize_callout_type(raw);
  return CANONICAL_TYPE[normalized] ?? normalized;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function parse_callout_directive(text: string): CalloutData | null {
  const match = CALLOUT_DIRECTIVE_RE.exec(text.trim());
  if (!match?.groups) return null;

  const raw_type = match.groups["type"] ?? "";
  const fold = match.groups["fold"];
  const explicit_title = match.groups["title"]?.trim();

  const callout_type = normalize_callout_type(raw_type);

  return {
    callout_type,
    title: explicit_title || capitalize(raw_type),
    foldable: fold === "+" || fold === "-",
    default_folded: fold === "-",
  };
}

export function format_callout_directive(data: CalloutData): string {
  const fold_marker = data.foldable ? (data.default_folded ? "-" : "+") : "";
  const default_title = capitalize(data.callout_type);
  const title_part =
    data.title && data.title !== default_title ? ` ${data.title}` : "";
  return `[!${data.callout_type}]${fold_marker}${title_part}`;
}

function is_blockquote_callout(node: RootContent): node is Blockquote {
  if (node.type !== "blockquote") return false;
  const bq = node as Blockquote;
  const first_child = bq.children[0];
  if (!first_child || first_child.type !== "paragraph") return false;
  const para = first_child as Paragraph;
  const first_inline = para.children[0];
  if (!first_inline || first_inline.type !== "text") return false;
  const text = (first_inline as Text).value;
  return CALLOUT_DIRECTIVE_RE.test(text.split("\n")[0] ?? "");
}

type MdastNode = Record<string, unknown> & { type: string };

function transform_blockquote_to_callout(bq: Blockquote): MdastNode {
  const first_para = bq.children[0] as Paragraph;
  const first_text = first_para.children[0] as Text;
  const lines = first_text.value.split("\n");
  const directive_line = lines[0] ?? "";

  const data = parse_callout_directive(directive_line);
  if (!data) return bq as unknown as MdastNode;

  const remaining_first_line = lines.slice(1).join("\n").trim();
  const remaining_para_children = first_para.children.slice(1);

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
      } as Paragraph);
    }
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
      foldable: data.foldable,
      default_folded: data.default_folded,
    },
    children: [
      {
        type: "calloutTitle",
        children: [{ type: "text", value: data.title }],
      },
      {
        type: "calloutBody",
        children: callout_body,
      },
    ],
  };
}

function transform_children(nodes: RootContent[]): RootContent[] {
  return nodes.map((node) => {
    if (is_blockquote_callout(node)) {
      return transform_blockquote_to_callout(node) as unknown as RootContent;
    }
    return node;
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
        foldable?: boolean;
        default_folded?: boolean;
      };
      children: Array<{ children: unknown }>;
    },
    _parent: unknown,
    state: StringifyState,
    info: unknown,
  ): string {
    const d = node.data ?? {};
    const callout_type = d.callout_type || "note";
    const title = d.title || capitalize(callout_type);
    const foldable = d.foldable ?? false;
    const default_folded = d.default_folded ?? false;

    const directive = format_callout_directive({
      callout_type: callout_type as CalloutType,
      title,
      foldable,
      default_folded,
    });

    const body_node = node.children[1];
    const body_str = body_node ? state.containerFlow(body_node, info) : "";

    const body_lines = body_str
      .split("\n")
      .map((line) => (line ? `> ${line}` : ">"))
      .join("\n");

    return `> ${directive}\n${body_lines}`;
  },
  calloutTitle(): string {
    return "";
  },
  calloutBody(): string {
    return "";
  },
};
