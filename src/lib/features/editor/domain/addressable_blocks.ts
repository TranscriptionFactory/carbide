import type { Root } from "mdast";
import { parse_to_mdast } from "$lib/features/editor/adapters/markdown_pipeline";
import { BLOCK_ID_PATTERN } from "$lib/features/editor/domain/block_id";

export type AddressableBlock = {
  text: string;
  end_line: number;
  end_offset: number;
  block_id: string | null;
};

type BlockNode = {
  type: string;
  value?: string;
  children?: BlockNode[];
  position?: { end: { line: number; offset?: number } };
};

function node_text(node: BlockNode): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if (!("children" in node)) return "";
  return node.children.map(node_text).join("");
}

function children(node: BlockNode): BlockNode[] {
  return node.children ?? [];
}

function collect(node: BlockNode, blocks: AddressableBlock[]): void {
  if (node.type === "paragraph") {
    const end_line = node.position?.end.line;
    const end_offset = node.position?.end.offset;
    if (end_line === undefined || end_offset === undefined) return;
    const raw_text = node_text(node);
    blocks.push({
      text: raw_text.replace(BLOCK_ID_PATTERN, "").trim(),
      end_line,
      end_offset,
      block_id: BLOCK_ID_PATTERN.exec(raw_text)?.[1] ?? null,
    });
    return;
  }

  if (node.type === "callout") {
    const body = children(node).find((child) => child.type === "calloutBody");
    if (body) collect(body, blocks);
    return;
  }
  if (node.type === "details") {
    const content = children(node).find(
      (child) => child.type === "detailsContent",
    );
    if (content) collect(content, blocks);
    return;
  }

  if (
    node.type === "root" ||
    node.type === "list" ||
    node.type === "listItem" ||
    node.type === "blockquote" ||
    node.type === "calloutBody" ||
    node.type === "detailsContent"
  ) {
    for (const child of children(node)) collect(child, blocks);
  }
}

export function collect_addressable_blocks(
  markdown: string,
): AddressableBlock[] {
  const blocks: AddressableBlock[] = [];
  collect(parse_to_mdast(markdown) as Root & BlockNode, blocks);
  return blocks;
}
