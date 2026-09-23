import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

function apply_width_to_node_dom(view: EditorView) {
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== "image-block") return;
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return;
    const wrapper = dom.querySelector<HTMLElement>(".image-wrapper");
    if (!wrapper) return;
    const width =
      typeof node.attrs["width"] === "string" ? node.attrs["width"] : "";
    wrapper.style.width = width || "";
  });
}

const image_width_plugin_key = new PluginKey("image-width");

export function create_image_width_prose_plugin(): Plugin {
  return new Plugin({
    key: image_width_plugin_key,
    view: (view) => {
      apply_width_to_node_dom(view);
      return {
        update: (updated_view) => {
          apply_width_to_node_dom(updated_view);
        },
      };
    },
  });
}
