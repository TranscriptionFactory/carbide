import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  compute_floating_position,
  create_backdrop,
  Z_FORMATTING_TOOLBAR,
} from "./floating_toolbar_utils";

export const formatting_toolbar_plugin_key = new PluginKey(
  "formatting-toolbar",
);

export function create_formatting_toolbar_prose_plugin(
  container: HTMLElement,
  on_show: () => void,
  on_hide: () => void,
): Plugin {
  let toolbar_el: HTMLElement | null = null;
  let backdrop_el: HTMLElement | null = null;
  let anchor_el: HTMLElement | null = null;

  function remove_toolbar() {
    toolbar_el?.remove();
    backdrop_el?.remove();
    toolbar_el = null;
    backdrop_el = null;
    anchor_el?.remove();
    anchor_el = null;
    on_hide();
  }

  function create_anchor(view: EditorView): HTMLElement {
    const { from, to } = view.state.selection;
    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);
    const anchor = document.createElement("div");
    anchor.style.cssText =
      "position:fixed;pointer-events:none;opacity:0;z-index:-1;";
    const left = Math.min(start.left, end.left);
    const top = Math.min(start.top, end.top);
    const width = Math.abs(end.left - start.left) || 1;
    const height = Math.abs(end.top - start.top) || start.bottom - start.top;
    anchor.style.left = `${String(left)}px`;
    anchor.style.top = `${String(top)}px`;
    anchor.style.width = `${String(width)}px`;
    anchor.style.height = `${String(height)}px`;
    return anchor;
  }

  return new Plugin({
    key: formatting_toolbar_plugin_key,
    view() {
      return {
        update(view) {
          const { from, to, empty } = view.state.selection;
          const has_selection = !empty && from !== to;

          if (!has_selection) {
            remove_toolbar();
            return;
          }

          if (!toolbar_el) {
            toolbar_el = container;
            toolbar_el.style.zIndex = String(Z_FORMATTING_TOOLBAR);
            backdrop_el = create_backdrop(remove_toolbar);
            anchor_el = create_anchor(view);
            document.body.appendChild(backdrop_el);
            document.body.appendChild(anchor_el);
            document.body.appendChild(toolbar_el);
            on_show();
          }

          if (anchor_el) {
            anchor_el.remove();
            anchor_el = create_anchor(view);
            document.body.appendChild(anchor_el);
          }

          if (!anchor_el) return;

          void compute_floating_position(anchor_el, toolbar_el, "top").then(
            ({ x, y }) => {
              if (!toolbar_el) return;
              Object.assign(toolbar_el.style, {
                position: "absolute",
                left: `${String(x)}px`,
                top: `${String(y)}px`,
              });
            },
          );
        },
        destroy() {
          remove_toolbar();
        },
      };
    },
  });
}
