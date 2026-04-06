import { Plugin, PluginKey, NodeSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import { is_draggable_node_type } from "../domain/detect_draggable_blocks";
import {
  compute_block_drop,
  apply_block_move,
} from "../domain/compute_block_drop";

export const block_drag_handle_plugin_key = new PluginKey("block_drag_handle");

function resolve_top_level_block(
  view: EditorView,
  pos: number,
): { pos: number; node: ProseNode } | null {
  const $pos = view.state.doc.resolve(pos);
  if ($pos.depth === 0) return null;

  const top_pos = $pos.before(1);
  const node = view.state.doc.nodeAt(top_pos);
  if (!node || !is_draggable_node_type(node.type.name)) return null;

  return { pos: top_pos, node };
}

function create_handle_element(): HTMLDivElement {
  const handle = document.createElement("div");
  handle.className = "block-drag-handle";
  handle.contentEditable = "false";
  handle.draggable = true;
  handle.setAttribute("aria-label", "Drag to reorder block");
  handle.setAttribute("role", "button");

  const grip = document.createElement("div");
  grip.className = "block-drag-handle__grip";
  handle.appendChild(grip);

  return handle;
}

type BlockDragState = {
  dragging_from: number | null;
};

export function create_block_drag_handle_prose_plugin(): Plugin {
  return new Plugin({
    key: block_drag_handle_plugin_key,

    state: {
      init(): BlockDragState {
        return { dragging_from: null };
      },
      apply(_tr, value): BlockDragState {
        return value;
      },
    },

    props: {
      handleDrop(view, event, _slice, moved) {
        const plugin_state = block_drag_handle_plugin_key.getState(
          view.state,
        ) as BlockDragState | undefined;
        if (!plugin_state?.dragging_from && plugin_state?.dragging_from !== 0)
          return false;
        if (!moved) return false;

        const source_pos = plugin_state.dragging_from;
        const coords = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        if (!coords) return false;

        const result = compute_block_drop(
          view.state.doc,
          source_pos,
          coords.pos,
        );
        if (!result) return false;

        const tr = view.state.tr;
        apply_block_move(tr, result);
        view.dispatch(tr);

        plugin_state.dragging_from = null;
        return true;
      },
    },

    view(editor_view: EditorView) {
      const handle = create_handle_element();
      let current_block_pos: number | null = null;
      let is_dragging = false;

      const editor_dom = editor_view.dom;
      const parent = editor_dom.parentElement;
      if (!parent) return {};

      parent.style.position = "relative";
      parent.appendChild(handle);

      function position_handle(view: EditorView, block_pos: number) {
        const node = view.state.doc.nodeAt(block_pos);
        if (!node) {
          hide_handle();
          return;
        }

        const dom_node = view.nodeDOM(block_pos);
        if (!dom_node || !(dom_node instanceof HTMLElement)) {
          hide_handle();
          return;
        }

        const editor_rect = view.dom.getBoundingClientRect();
        const block_rect = dom_node.getBoundingClientRect();

        handle.style.top = `${String(block_rect.top - editor_rect.top + view.dom.scrollTop)}px`;
        handle.style.display = "";
        handle.dataset["blockPos"] = String(block_pos);
        current_block_pos = block_pos;
      }

      function hide_handle() {
        handle.style.display = "none";
        handle.removeAttribute("data-block-pos");
        current_block_pos = null;
      }

      function on_mousemove(event: MouseEvent) {
        if (is_dragging) return;

        const pos_info = editor_view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        if (!pos_info) {
          hide_handle();
          return;
        }

        const block = resolve_top_level_block(editor_view, pos_info.pos);
        if (!block) {
          hide_handle();
          return;
        }

        if (block.pos !== current_block_pos) {
          position_handle(editor_view, block.pos);
        }
      }

      function on_mouseleave(event: MouseEvent) {
        if (is_dragging) return;
        const related = event.relatedTarget;
        if (related === handle || handle.contains(related as Node)) return;
        hide_handle();
      }

      function on_handle_mouseenter() {
        handle.classList.add("block-drag-handle--hover");
      }

      function on_handle_mouseleave(event: MouseEvent) {
        handle.classList.remove("block-drag-handle--hover");
        const related = event.relatedTarget;
        if (
          !is_dragging &&
          related !== editor_dom &&
          !editor_dom.contains(related as Node)
        ) {
          hide_handle();
        }
      }

      function on_dragstart(event: DragEvent) {
        if (current_block_pos === null) return;

        const node = editor_view.state.doc.nodeAt(current_block_pos);
        if (!node) return;

        is_dragging = true;
        handle.classList.add("block-drag-handle--dragging");

        const plugin_state = block_drag_handle_plugin_key.getState(
          editor_view.state,
        ) as BlockDragState | undefined;
        if (plugin_state) {
          plugin_state.dragging_from = current_block_pos;
        }

        const sel = NodeSelection.create(
          editor_view.state.doc,
          current_block_pos,
        );
        editor_view.dispatch(editor_view.state.tr.setSelection(sel));

        const dom_node = editor_view.nodeDOM(current_block_pos);
        if (dom_node instanceof HTMLElement && event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setDragImage(dom_node, 0, 0);
        }

        editor_view.dragging = {
          slice: sel.content(),
          move: true,
        };
      }

      function on_dragend() {
        is_dragging = false;
        handle.classList.remove("block-drag-handle--dragging");

        const plugin_state = block_drag_handle_plugin_key.getState(
          editor_view.state,
        ) as BlockDragState | undefined;
        if (plugin_state) {
          plugin_state.dragging_from = null;
        }

        hide_handle();
      }

      editor_dom.addEventListener("mousemove", on_mousemove);
      editor_dom.addEventListener("mouseleave", on_mouseleave);
      handle.addEventListener("mouseenter", on_handle_mouseenter);
      handle.addEventListener("mouseleave", on_handle_mouseleave);
      handle.addEventListener("dragstart", on_dragstart);
      handle.addEventListener("dragend", on_dragend);

      hide_handle();

      return {
        update(view: EditorView) {
          if (is_dragging) return;
          if (current_block_pos !== null) {
            const node = view.state.doc.nodeAt(current_block_pos);
            if (!node || !is_draggable_node_type(node.type.name)) {
              hide_handle();
            } else {
              position_handle(view, current_block_pos);
            }
          }
        },

        destroy() {
          editor_dom.removeEventListener("mousemove", on_mousemove);
          editor_dom.removeEventListener("mouseleave", on_mouseleave);
          handle.removeEventListener("mouseenter", on_handle_mouseenter);
          handle.removeEventListener("mouseleave", on_handle_mouseleave);
          handle.removeEventListener("dragstart", on_dragstart);
          handle.removeEventListener("dragend", on_dragend);
          handle.remove();
        },
      };
    },
  });
}
