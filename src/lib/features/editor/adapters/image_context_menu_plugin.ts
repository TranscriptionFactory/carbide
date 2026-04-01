import { Plugin, PluginKey } from "prosemirror-state";

export type ImageContextMenuState = {
  open: boolean;
  pos: number;
  clientX: number;
  clientY: number;
  src: string;
  alt: string;
  width: string;
  isLocal: boolean;
};

const INITIAL_STATE: ImageContextMenuState = {
  open: false,
  pos: -1,
  clientX: 0,
  clientY: 0,
  src: "",
  alt: "",
  width: "",
  isLocal: false,
};

export const image_context_menu_plugin_key =
  new PluginKey<ImageContextMenuState>("image-context-menu");

export function create_image_context_menu_prose_plugin(): Plugin {
  return new Plugin({
    key: image_context_menu_plugin_key,
    state: {
      init(): ImageContextMenuState {
        return { ...INITIAL_STATE };
      },
      apply(tr, prev): ImageContextMenuState {
        const meta = tr.getMeta(image_context_menu_plugin_key);
        if (!meta) return prev;
        if (meta.type === "open") {
          return {
            open: true,
            pos: meta.pos,
            clientX: meta.clientX,
            clientY: meta.clientY,
            src: meta.src,
            alt: meta.alt,
            width: meta.width,
            isLocal: meta.isLocal,
          };
        }
        if (meta.type === "close") {
          return { ...INITIAL_STATE };
        }
        return prev;
      },
    },
    props: {
      handleDOMEvents: {
        contextmenu(view, event) {
          const target = event.target;
          if (!(target instanceof HTMLImageElement)) return false;

          const image_block = target.closest(".milkdown-image-block");
          if (!image_block) {
            const inline_image = target.closest(
              ".ProseMirror img:not(.milkdown-image-block img)",
            );
            if (!inline_image) return false;
          }

          const posAtCoords = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          if (!posAtCoords) return false;

          const resolved = view.state.doc.resolve(posAtCoords.pos);
          let image_pos = posAtCoords.pos;
          for (let d = resolved.depth; d >= 0; d--) {
            const node = resolved.node(d);
            if (
              node.type.name === "image-block" ||
              node.type.name === "image"
            ) {
              image_pos = resolved.before(d);
              break;
            }
          }

          const node = view.state.doc.nodeAt(image_pos);
          if (
            !node ||
            (node.type.name !== "image-block" && node.type.name !== "image")
          ) {
            return false;
          }

          const src = String(node.attrs["src"] || "");
          const alt = String(node.attrs["alt"] || node.attrs["caption"] || "");
          const width =
            typeof node.attrs["width"] === "string" ? node.attrs["width"] : "";
          const isLocal = !/^[a-z][a-z0-9+.-]*:/i.test(src);

          const tr = view.state.tr.setMeta(image_context_menu_plugin_key, {
            type: "open",
            pos: image_pos,
            clientX: event.clientX,
            clientY: event.clientY,
            src,
            alt,
            width,
            isLocal,
          });
          view.dispatch(tr);

          event.preventDefault();
          return true;
        },
        mousedown(view) {
          const state = image_context_menu_plugin_key.getState(view.state);
          if (state?.open) {
            const tr = view.state.tr.setMeta(image_context_menu_plugin_key, {
              type: "close",
            });
            view.dispatch(tr);
          }
          return false;
        },
      },
    },
  });
}
