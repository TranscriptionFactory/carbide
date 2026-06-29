import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  append_column,
  append_row,
  find_table_at,
  type TableContext,
} from "./table_command_utils";
import { Z_TABLE_CONTROLS } from "./floating_toolbar_utils";

const table_edge_controls_plugin_key = new PluginKey("table_edge_controls");

const HIDE_DELAY_MS = 150;
const BAR_THICKNESS_PX = 12;

function create_overlay_element(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.className = "table-edge-controls-overlay";
  overlay.contentEditable = "false";
  overlay.style.zIndex = String(Z_TABLE_CONTROLS);
  return overlay;
}

function create_bar_element(modifier: "right" | "bottom"): HTMLDivElement {
  const bar = document.createElement("div");
  bar.className = `table-edge-bar table-edge-bar--${modifier}`;
  bar.contentEditable = "false";
  bar.setAttribute("role", "button");
  bar.setAttribute(
    "aria-label",
    modifier === "right" ? "Append column" : "Append row",
  );

  const glyph = document.createElement("div");
  glyph.className = "table-edge-bar__glyph";
  glyph.textContent = "+";
  bar.appendChild(glyph);

  return bar;
}

function resolve_wrapper_dom(
  view: EditorView,
  table_pos: number,
): HTMLElement | null {
  const dom = view.nodeDOM(table_pos);
  if (!(dom instanceof HTMLElement)) return null;
  if (dom.classList.contains("tableWrapper")) return dom;
  return dom.closest(".tableWrapper") ?? dom;
}

export function create_table_edge_controls_prose_plugin(): Plugin {
  return new Plugin({
    key: table_edge_controls_plugin_key,

    view(editor_view: EditorView) {
      const editor_dom = editor_view.dom;
      if (!editor_dom.parentElement) return {};
      const mount_target: HTMLElement = editor_dom.parentElement;

      const overlay = create_overlay_element();
      const right_bar = create_bar_element("right");
      const bottom_bar = create_bar_element("bottom");
      overlay.appendChild(right_bar);
      overlay.appendChild(bottom_bar);

      mount_target.style.position = "relative";
      mount_target.appendChild(overlay);

      let current_table_pos: number | null = null;
      let hide_timer: ReturnType<typeof setTimeout> | null = null;

      function cancel_pending_hide() {
        if (hide_timer !== null) {
          clearTimeout(hide_timer);
          hide_timer = null;
        }
      }

      function hide_bars() {
        cancel_pending_hide();
        overlay.style.display = "none";
        current_table_pos = null;
      }

      function schedule_hide() {
        cancel_pending_hide();
        hide_timer = setTimeout(() => {
          hide_timer = null;
          if (!overlay.matches(":hover")) hide_bars();
        }, HIDE_DELAY_MS);
      }

      function position_bars(view: EditorView, table: TableContext) {
        const wrapper = resolve_wrapper_dom(view, table.pos);
        if (!wrapper) {
          hide_bars();
          return;
        }

        cancel_pending_hide();

        const mount_rect = mount_target.getBoundingClientRect();
        const rect = wrapper.getBoundingClientRect();
        const left = rect.left - mount_rect.left + mount_target.scrollLeft;
        const top = rect.top - mount_rect.top + mount_target.scrollTop;

        right_bar.style.left = `${String(left + rect.width)}px`;
        right_bar.style.top = `${String(top)}px`;
        right_bar.style.height = `${String(rect.height)}px`;
        right_bar.style.width = `${String(BAR_THICKNESS_PX)}px`;

        bottom_bar.style.top = `${String(top + rect.height)}px`;
        bottom_bar.style.left = `${String(left)}px`;
        bottom_bar.style.width = `${String(rect.width)}px`;
        bottom_bar.style.height = `${String(BAR_THICKNESS_PX)}px`;

        overlay.style.display = "";
        current_table_pos = table.pos;
      }

      function table_at_pointer(event: MouseEvent): TableContext | null {
        return find_table_at(editor_view, {
          left: event.clientX,
          top: event.clientY,
        });
      }

      function on_mousemove(event: MouseEvent) {
        const table = table_at_pointer(event);
        if (!table) {
          schedule_hide();
          return;
        }
        position_bars(editor_view, table);
      }

      function on_mouseleave() {
        schedule_hide();
      }

      function on_overlay_mouseenter() {
        cancel_pending_hide();
      }

      function on_overlay_mouseleave() {
        schedule_hide();
      }

      function run_append(
        build: (
          state: EditorView["state"],
          table: TableContext,
        ) => ReturnType<typeof append_column>,
      ) {
        if (current_table_pos === null) return;
        const found = current_table_pos;
        const node = editor_view.state.doc.nodeAt(found);
        if (!node || node.type.name !== "table") return;
        const table: TableContext = { pos: found, start: found + 1, node };
        editor_view.dispatch(build(editor_view.state, table));
        editor_view.focus();
      }

      function on_right_mousedown(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();
        run_append(append_column);
      }

      function on_bottom_mousedown(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();
        run_append(append_row);
      }

      editor_dom.addEventListener("mousemove", on_mousemove);
      editor_dom.addEventListener("mouseleave", on_mouseleave);
      overlay.addEventListener("mouseenter", on_overlay_mouseenter);
      overlay.addEventListener("mouseleave", on_overlay_mouseleave);
      right_bar.addEventListener("mousedown", on_right_mousedown);
      bottom_bar.addEventListener("mousedown", on_bottom_mousedown);

      hide_bars();

      return {
        update(view: EditorView) {
          if (current_table_pos === null) return;
          if (!view.dom.offsetParent) {
            hide_bars();
            return;
          }
          const node = view.state.doc.nodeAt(current_table_pos);
          if (!node || node.type.name !== "table") {
            hide_bars();
            return;
          }
          position_bars(view, {
            pos: current_table_pos,
            start: current_table_pos + 1,
            node,
          });
        },
        destroy() {
          cancel_pending_hide();
          editor_dom.removeEventListener("mousemove", on_mousemove);
          editor_dom.removeEventListener("mouseleave", on_mouseleave);
          overlay.removeEventListener("mouseenter", on_overlay_mouseenter);
          overlay.removeEventListener("mouseleave", on_overlay_mouseleave);
          right_bar.removeEventListener("mousedown", on_right_mousedown);
          bottom_bar.removeEventListener("mousedown", on_bottom_mousedown);
          overlay.remove();
        },
      };
    },
  });
}
