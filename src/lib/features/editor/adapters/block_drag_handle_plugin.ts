import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import { is_draggable_node_type } from "../domain/detect_draggable_blocks";
import {
  compute_section_drop,
  apply_block_move,
} from "../domain/compute_block_drop";
import { compute_heading_ranges } from "./heading_fold_plugin";

const block_drag_handle_plugin_key = new PluginKey("block_drag_handle");

const HIDE_DELAY_MS = 150;

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

function create_overlay_element(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.className = "block-drag-handle-overlay";
  overlay.contentEditable = "false";
  return overlay;
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

function compute_drag_range(
  view: EditorView,
  block_pos: number,
): { from: number; to: number } | null {
  const node = view.state.doc.nodeAt(block_pos);
  if (!node) return null;

  if (node.type.name === "heading") {
    const ranges = compute_heading_ranges(view.state.doc);
    const range = ranges.find((r) => r.heading_pos === block_pos);
    if (range) {
      return { from: range.heading_pos, to: range.body_end };
    }
    return { from: block_pos, to: block_pos + node.nodeSize };
  }

  return { from: block_pos, to: block_pos + node.nodeSize };
}

export function create_block_drag_handle_prose_plugin(): Plugin {
  let dragging_range: { from: number; to: number } | null = null;

  return new Plugin({
    key: block_drag_handle_plugin_key,

    props: {
      handleDrop(view, event, _slice, moved) {
        if (dragging_range == null) return false;
        if (!moved) return false;

        const range = dragging_range;
        const coords = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        if (!coords) return false;

        const result = compute_section_drop(
          view.state.doc,
          range.from,
          range.to,
          coords.pos,
        );
        if (!result) return false;

        const tr = view.state.tr;
        apply_block_move(tr, result);
        view.dispatch(tr);

        dragging_range = null;
        return true;
      },
    },

    view(editor_view: EditorView) {
      const overlay = create_overlay_element();
      const handle = create_handle_element();
      let current_block_pos: number | null = null;
      let is_dragging = false;
      let hide_timer: ReturnType<typeof setTimeout> | null = null;

      const editor_dom = editor_view.dom;

      if (!editor_dom.parentElement) {
        return {};
      }

      const mount_target: HTMLElement = editor_dom.parentElement;

      mount_target.style.position = "relative";
      overlay.appendChild(handle);
      mount_target.appendChild(overlay);

      function is_feature_enabled(): boolean {
        return editor_dom.closest(".show-block-drag-handle") !== null;
      }

      function cancel_pending_hide() {
        if (hide_timer !== null) {
          clearTimeout(hide_timer);
          hide_timer = null;
        }
      }

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

        cancel_pending_hide();

        const mount_target_rect = mount_target.getBoundingClientRect();
        const block_rect = dom_node.getBoundingClientRect();

        const style = getComputedStyle(dom_node);
        const line_height = parseFloat(style.lineHeight) || block_rect.height;
        const padding_top = parseFloat(style.paddingTop) || 0;
        const handle_height = handle.offsetHeight || 24;
        const baseline_offset =
          padding_top + line_height * 0.8 - handle_height;

        overlay.style.left = `${String(editor_dom.offsetLeft)}px`;
        overlay.style.width = `${String(editor_dom.offsetWidth)}px`;
        handle.style.top = `${String(block_rect.top - mount_target_rect.top + mount_target.scrollTop + baseline_offset)}px`;
        handle.style.display = "";
        handle.classList.add("block-drag-handle--near");
        handle.dataset["blockPos"] = String(block_pos);
        current_block_pos = block_pos;
      }

      function hide_handle() {
        cancel_pending_hide();
        handle.style.display = "none";
        handle.classList.remove("block-drag-handle--near");
        handle.removeAttribute("data-block-pos");
        current_block_pos = null;
      }

      function schedule_hide() {
        cancel_pending_hide();
        hide_timer = setTimeout(() => {
          hide_timer = null;
          if (!handle.matches(":hover")) {
            hide_handle();
          }
        }, HIDE_DELAY_MS);
      }

      function on_mousemove(event: MouseEvent) {
        if (is_dragging) return;
        if (!is_feature_enabled()) return;

        cancel_pending_hide();

        const pos_info = editor_view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        if (!pos_info) {
          schedule_hide();
          return;
        }

        const block = resolve_top_level_block(editor_view, pos_info.pos);
        if (!block) {
          schedule_hide();
          return;
        }

        if (block.pos !== current_block_pos) {
          position_handle(editor_view, block.pos);
        }
      }

      function on_mouseleave() {
        if (is_dragging) return;
        schedule_hide();
      }

      function on_handle_mouseenter() {
        cancel_pending_hide();
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

        const range = compute_drag_range(editor_view, current_block_pos);
        if (!range) return;

        is_dragging = true;
        handle.classList.add("block-drag-handle--dragging");

        dragging_range = range;

        const sel = TextSelection.create(
          editor_view.state.doc,
          range.from,
          range.to,
        );
        editor_view.dispatch(editor_view.state.tr.setSelection(sel));

        const slice = editor_view.state.doc.slice(range.from, range.to);

        const dom_node = editor_view.nodeDOM(current_block_pos);
        if (dom_node instanceof HTMLElement && event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setDragImage(dom_node, 0, 0);
        }

        editor_view.dragging = {
          slice,
          move: true,
        };
      }

      function on_dragend() {
        is_dragging = false;
        handle.classList.remove("block-drag-handle--dragging");

        dragging_range = null;

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
          cancel_pending_hide();
          editor_dom.removeEventListener("mousemove", on_mousemove);
          editor_dom.removeEventListener("mouseleave", on_mouseleave);
          handle.removeEventListener("mouseenter", on_handle_mouseenter);
          handle.removeEventListener("mouseleave", on_handle_mouseleave);
          handle.removeEventListener("dragstart", on_dragstart);
          handle.removeEventListener("dragend", on_dragend);
          overlay.remove();
        },
      };
    },
  });
}
