import type { Node as PmNode } from "prosemirror-model";
import { type Transaction, NodeSelection } from "prosemirror-state";
import { is_draggable_node_type } from "./detect_draggable_blocks";

export type BlockDropResult = {
  from: number;
  to: number;
  insert_pos: number;
};

export function resolve_drop_target(doc: PmNode, raw_pos: number): number {
  const $pos = doc.resolve(Math.min(raw_pos, doc.content.size));

  if ($pos.depth === 0) {
    let best = 0;
    let best_dist = Infinity;
    doc.forEach((_node, offset) => {
      const dist = Math.abs(offset - raw_pos);
      if (dist < best_dist) {
        best_dist = dist;
        best = offset;
      }
      const end = offset + _node.nodeSize;
      const end_dist = Math.abs(end - raw_pos);
      if (end_dist < best_dist) {
        best_dist = end_dist;
        best = end;
      }
    });
    return best;
  }

  const block_start = $pos.before(1);
  const block_node = doc.nodeAt(block_start);
  if (!block_node) return block_start;

  const block_end = block_start + block_node.nodeSize;
  const mid = block_start + block_node.nodeSize / 2;
  return raw_pos <= mid ? block_start : block_end;
}

export function compute_block_drop(
  doc: PmNode,
  source_pos: number,
  raw_drop_pos: number,
): BlockDropResult | null {
  const source_node = doc.nodeAt(source_pos);
  if (!source_node || !is_draggable_node_type(source_node.type.name))
    return null;

  const from = source_pos;
  const to = source_pos + source_node.nodeSize;
  const insert_pos = resolve_drop_target(doc, raw_drop_pos);

  if (insert_pos >= from && insert_pos <= to) return null;

  return { from, to, insert_pos };
}

export function compute_section_drop(
  doc: PmNode,
  section_from: number,
  section_to: number,
  raw_drop_pos: number,
): BlockDropResult | null {
  if (section_from >= section_to) return null;

  const insert_pos = resolve_drop_target(doc, raw_drop_pos);

  if (insert_pos >= section_from && insert_pos <= section_to) return null;

  return { from: section_from, to: section_to, insert_pos };
}

export function apply_block_move(
  tr: Transaction,
  result: BlockDropResult,
): Transaction {
  const { from, to, insert_pos } = result;
  const slice = tr.doc.slice(from, to);

  if (insert_pos < from) {
    tr.delete(from, to);
    tr.insert(insert_pos, slice.content);
    const sel = NodeSelection.create(tr.doc, insert_pos);
    tr.setSelection(sel);
  } else {
    tr.insert(insert_pos, slice.content);
    tr.delete(from, to);
    const adjusted_pos = insert_pos - (to - from);
    const sel = NodeSelection.create(tr.doc, adjusted_pos);
    tr.setSelection(sel);
  }

  return tr.scrollIntoView();
}
