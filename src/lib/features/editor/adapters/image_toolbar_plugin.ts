import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  compute_floating_position,
  create_backdrop,
  Z_IMAGE_TOOLBAR,
} from "./floating_toolbar_utils";

const WIDTH_PRESETS = ["25%", "50%", "75%", "100%"] as const;

function create_resize_toolbar(
  view: EditorView,
  pos: number,
  current_width: string,
  on_dismiss: () => void,
): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "image-toolbar";
  toolbar.contentEditable = "false";

  for (const width of WIDTH_PRESETS) {
    const btn = document.createElement("button");
    btn.className = current_width === width ? "size-btn active" : "size-btn";
    btn.type = "button";
    btn.textContent = width;
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const node = view.state.doc.nodeAt(pos);
      if (!node) return;
      const new_width = current_width === width ? "" : width;
      const tr = view.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        width: new_width,
      });
      view.dispatch(tr);
      on_dismiss();
    });
    toolbar.appendChild(btn);
  }

  return toolbar;
}

export const image_toolbar_plugin_key = new PluginKey("image-toolbar");

export const image_toolbar_plugin = $prose(() => {
  let toolbar_el: HTMLElement | null = null;
  let backdrop_el: HTMLElement | null = null;

  function remove_toolbar() {
    toolbar_el?.remove();
    backdrop_el?.remove();
    toolbar_el = null;
    backdrop_el = null;
  }

  return new Plugin({
    key: image_toolbar_plugin_key,
    props: {
      handleClick(view, pos, event) {
        const target = event.target;
        if (!(target instanceof HTMLImageElement)) return false;

        const image_block = target.closest(".milkdown-image-block");
        if (!image_block) return false;

        const resolved = view.state.doc.resolve(pos);
        let image_pos = pos;
        for (let d = resolved.depth; d >= 0; d--) {
          if (resolved.node(d).type.name === "image-block") {
            image_pos = resolved.before(d);
            break;
          }
        }

        const node = view.state.doc.nodeAt(image_pos);
        if (!node || node.type.name !== "image-block") return false;

        remove_toolbar();

        const current_width = (node.attrs.width as string) ?? "";
        toolbar_el = create_resize_toolbar(
          view,
          image_pos,
          current_width,
          remove_toolbar,
        );
        toolbar_el.style.zIndex = String(Z_IMAGE_TOOLBAR);
        backdrop_el = create_backdrop(remove_toolbar);
        document.body.appendChild(backdrop_el);
        document.body.appendChild(toolbar_el);

        void compute_floating_position(
          image_block as HTMLElement,
          toolbar_el,
          "top",
        ).then(({ x, y }) => {
          if (!toolbar_el) return;
          Object.assign(toolbar_el.style, {
            position: "absolute",
            left: `${String(x)}px`,
            top: `${String(y)}px`,
          });
        });

        return false;
      },
    },
    view() {
      return {
        destroy() {
          remove_toolbar();
        },
      };
    },
  });
});
