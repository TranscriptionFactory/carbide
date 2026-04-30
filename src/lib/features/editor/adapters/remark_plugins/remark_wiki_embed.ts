import type { Root, RootContent, Paragraph, Text } from "mdast";
import type { Plugin } from "unified";

const WIKI_EMBED_RE = /^!\[\[([^\]\n]+?)\]\]$/;

type MdastNode = Record<string, unknown> & { type: string };

function is_wiki_embed_paragraph(node: RootContent): node is Paragraph {
  if (node.type !== "paragraph") return false;
  const para = node as Paragraph;
  if (para.children.length !== 1) return false;
  const child = para.children[0];
  if (!child || child.type !== "text") return false;
  return WIKI_EMBED_RE.test((child as Text).value);
}

function transform_to_wiki_embed(para: Paragraph): MdastNode {
  const text = (para.children[0] as Text).value;
  return { type: "wikiEmbed", value: text };
}

function walk_children(nodes: RootContent[]): RootContent[] {
  return nodes.map((node) => {
    if (is_wiki_embed_paragraph(node)) {
      return transform_to_wiki_embed(node) as unknown as RootContent;
    }
    if (node.type === "blockquote" || node.type === "listItem") {
      const parent = node as unknown as { children: RootContent[] };
      parent.children = walk_children(parent.children);
    }
    if (node.type === "list") {
      const list = node as unknown as { children: RootContent[] };
      list.children = walk_children(list.children);
    }
    return node;
  });
}

export const remark_wiki_embed: Plugin<[], Root> = () => {
  return (tree: Root) => {
    tree.children = walk_children(tree.children);
  };
};
