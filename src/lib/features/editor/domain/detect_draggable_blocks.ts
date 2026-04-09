import type { Node as ProseNode } from "prosemirror-model";

export type DraggableBlock = {
  pos: number;
  end: number;
  node_type: string;
};

const DRAGGABLE_TYPES = new Set([
  "heading",
  "paragraph",
  "code_block",
  "blockquote",
  "bullet_list",
  "ordered_list",
  "hr",
  "table",
  "details_block",
  "image-block",
  "math_block",
  "file_embed",
  "excalidraw_embed",
]);

export function detect_draggable_blocks(doc: ProseNode): DraggableBlock[] {
  const blocks: DraggableBlock[] = [];
  doc.forEach((node, offset) => {
    if (DRAGGABLE_TYPES.has(node.type.name)) {
      blocks.push({
        pos: offset,
        end: offset + node.nodeSize,
        node_type: node.type.name,
      });
    }
  });
  return blocks;
}

export function is_draggable_node_type(type_name: string): boolean {
  return DRAGGABLE_TYPES.has(type_name);
}
