import type { Node as ProseNode, Schema } from "prosemirror-model";
import type { PluginKey, Transaction } from "prosemirror-state";

export function collect_paragraph_text(node: ProseNode): string | null {
  let text = "";
  let has_non_text = false;

  node.descendants((child: ProseNode) => {
    if (child.isText && child.text) {
      text += child.text;
      return true;
    }
    if (child.isInline) {
      has_non_text = true;
      return false;
    }
    return true;
  });

  if (has_non_text || text.length === 0) return null;
  return text;
}

export function is_full_scan_meta(
  key: PluginKey,
  transactions: readonly { getMeta(key: PluginKey): unknown }[],
): boolean {
  return transactions.some((tr) => {
    const meta = tr.getMeta(key);
    if (typeof meta !== "object" || meta === null) return false;
    return (meta as Record<string, unknown>).action === "full_scan";
  });
}

export function insert_leading_paragraph(
  tr: Transaction,
  schema: Schema,
  para_pos: number,
  new_node: ProseNode,
): number {
  const paragraph_type = schema.nodes.paragraph;
  let offset = 0;

  if (para_pos === 0 && paragraph_type) {
    const leading = paragraph_type.create();
    tr.insert(0, leading);
    offset = leading.nodeSize;
  }

  const after_pos = offset + para_pos + new_node.nodeSize;
  if (after_pos >= tr.doc.content.size && paragraph_type) {
    tr.insert(after_pos, paragraph_type.create());
  }

  return after_pos;
}

export function ensure_leading_paragraph(
  tr: Transaction,
  schema: Schema,
  embed_type_name: string,
): void {
  const first_child = tr.doc.firstChild;
  if (first_child && first_child.type.name === embed_type_name) {
    const paragraph_type = schema.nodes.paragraph;
    if (paragraph_type) {
      tr.insert(0, paragraph_type.create());
    }
  }
}
