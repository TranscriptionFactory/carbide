import type { Root, RootContent, Paragraph } from "mdast";
import type { Plugin } from "unified";
import { parse_html_embed, type ParsedHtmlEmbed } from "../html_embed";

type MdastNode = Record<string, unknown> & { type: string };

function reconstruct_html(node: Paragraph): string | null {
  let out = "";
  for (const child of node.children) {
    if (child.type === "html" || child.type === "text") {
      out += (child as { value: string }).value;
    } else {
      return null;
    }
  }
  return out;
}

function to_mdast_embed(parsed: ParsedHtmlEmbed): MdastNode {
  if (parsed.kind === "web_embed") {
    return {
      type: "embed",
      url: parsed.src,
      title: parsed.title,
      width: parsed.width,
      height: parsed.height,
      align: parsed.align,
    };
  }
  return {
    type: "video",
    url: parsed.src,
    poster: parsed.poster,
    width: parsed.width,
    height: parsed.height,
    controls: parsed.controls,
    autoplay: parsed.autoplay,
    loop: parsed.loop,
    muted: parsed.muted,
  };
}

function convert(node: RootContent): RootContent {
  if (node.type === "html") {
    const parsed = parse_html_embed((node as { value: string }).value);
    if (parsed) return to_mdast_embed(parsed) as unknown as RootContent;
  }

  if (node.type === "paragraph") {
    const raw = reconstruct_html(node);
    if (raw !== null) {
      const parsed = parse_html_embed(raw);
      if (parsed) return to_mdast_embed(parsed) as unknown as RootContent;
    }
  }

  if (
    node.type === "blockquote" ||
    node.type === "listItem" ||
    node.type === "list"
  ) {
    const parent = node as unknown as { children: RootContent[] };
    parent.children = parent.children.map(convert);
  }

  return node;
}

export const remark_html_embed: Plugin<[], Root> = () => {
  return (tree: Root) => {
    tree.children = tree.children.map(convert);
  };
};
