import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  compute_floating_position,
  create_backdrop,
  Z_FORMATTING_TOOLBAR,
} from "./floating_toolbar_utils";
import type { ToolbarVisibility } from "$lib/shared/types/editor_settings";

export type ToolbarConfig = {
  toolbar_visibility: ToolbarVisibility;
};

export const formatting_toolbar_plugin_key = new PluginKey(
  "formatting-toolbar",
);

export function create_formatting_toolbar_prose_plugin(
  container: HTMLElement,
  config: ToolbarConfig,
  on_show: () => void,
  on_hide: () => void,
  on_sticky_mount: (view: EditorView) => void,
  on_sticky_unmount: () => void,
): Plugin {
  let toolbar_el: HTMLElement | null = null;
  let backdrop_el: HTMLElement | null = null;
  let anchor_el: HTMLElement | null = null;
  let prev_mode: ToolbarVisibility | null = null;
  let sticky_mounted = false;

  function remove_floating_toolbar() {
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
          const mode = config.toolbar_visibility;

          if (mode !== prev_mode) {
            if (prev_mode === "on_select") remove_floating_toolbar();
            if (prev_mode === "always_show" && sticky_mounted) {
              on_sticky_unmount();
              sticky_mounted = false;
            }
            prev_mode = mode;
          }

          if (mode === "always_hide") {
            if (sticky_mounted) {
              on_sticky_unmount();
              sticky_mounted = false;
            }
            remove_floating_toolbar();
            return;
          }

          if (mode === "always_show") {
            if (!sticky_mounted) {
              on_sticky_mount(view);
              sticky_mounted = true;
            }
            return;
          }

          // on_select mode — existing floating behavior
          const { from, to, empty } = view.state.selection;
          const has_selection = !empty && from !== to;

          if (!has_selection) {
            remove_floating_toolbar();
            return;
          }

          if (!toolbar_el) {
            toolbar_el = container;
            toolbar_el.style.zIndex = String(Z_FORMATTING_TOOLBAR);
            backdrop_el = create_backdrop(remove_floating_toolbar);
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
          if (sticky_mounted) {
            on_sticky_unmount();
            sticky_mounted = false;
          }
          remove_floating_toolbar();
        },
      };
    },
  });
}
