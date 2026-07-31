import type { EditorView } from "prosemirror-view";
import { is_draggable_node_type } from "../domain/detect_draggable_blocks";
import { resolve_top_level_block } from "./block_drag_handle_plugin";

export function block_pos_at_coords(
  view: EditorView,
  x: number,
  y: number,
  target?: Element | null,
): number | null {
  const coords = view.posAtCoords({ left: x, top: y });
  if (coords) {
    const from_coords = block_pos_at_doc_pos(
      view,
      coords.inside >= 0 ? coords.inside : coords.pos,
    );
    if (from_coords != null) return from_coords;
  }
  return block_pos_at_dom(view, target);
}

function block_pos_at_doc_pos(view: EditorView, pos: number): number | null {
  const resolved = resolve_top_level_block(view, pos);
  if (resolved) return resolved.pos;

  const doc = view.state.doc;
  if (pos < 0 || pos > doc.content.size) return null;
  if (doc.resolve(pos).depth !== 0) return null;
  const node = doc.nodeAt(pos);
  if (!node || !is_draggable_node_type(node.type.name)) return null;
  return pos;
}

function block_pos_at_dom(
  view: EditorView,
  target?: Element | null,
): number | null {
  if (!target || !view.dom.contains(target)) return null;
  try {
    return block_pos_at_doc_pos(view, view.posAtDOM(target, 0));
  } catch {
    return null;
  }
}
