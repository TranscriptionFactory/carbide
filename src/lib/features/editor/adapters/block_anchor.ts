import type { Node as ProseNode } from "prosemirror-model";

export function find_block_anchor_position(
  doc: ProseNode,
  block_id: string,
): number | null {
  if (block_id === "") return null;
  const suffix = `^${block_id}`;
  let found = -1;

  doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (!node.isTextblock) return true;
    if (node.textContent.trimEnd().endsWith(suffix)) found = pos;
    return false;
  });

  return found >= 0 ? found : null;
}
