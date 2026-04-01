import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { mount, unmount } from "svelte";
import ImageContextMenu from "../ui/image_context_menu.svelte";
import {
  create_image_context_menu_prose_plugin,
  image_context_menu_plugin_key,
} from "../adapters/image_context_menu_plugin";
import type { EditorExtension } from "./types";

export function create_image_context_menu_extension(): EditorExtension {
  let menu_container: HTMLElement | null = null;
  let svelte_app: Record<string, unknown> | undefined;

  function ensure_container(): HTMLElement {
    if (!menu_container) {
      menu_container = document.createElement("div");
      menu_container.className = "image-context-menu-mount";
      menu_container.style.display = "none";
    }
    return menu_container;
  }

  function mount_menu(view: EditorView) {
    if (svelte_app) return;
    const container = ensure_container();
    container.style.display = "";
    svelte_app = mount(ImageContextMenu, {
      target: container,
      props: {
        view,
        on_close: () => {
          const tr = view.state.tr.setMeta(image_context_menu_plugin_key, {
            type: "close",
          });
          view.dispatch(tr);
        },
      },
    });
  }

  function hide_menu() {
    if (svelte_app) {
      void unmount(svelte_app);
      svelte_app = undefined;
    }
    if (menu_container) {
      menu_container.style.display = "none";
    }
  }

  function show_menu(view: EditorView) {
    mount_menu(view);
  }

  const plugin = create_image_context_menu_prose_plugin();

  const original_view = plugin.spec.view;
  plugin.spec.view = function plugin_view(prose_view: EditorView) {
    const inner = original_view?.(prose_view);
    if (!inner) return {};

    const original_update = inner.update;
    return {
      update(view: EditorView, prev_state: EditorState) {
        const prev = image_context_menu_plugin_key.getState(prev_state);
        const curr = image_context_menu_plugin_key.getState(view.state);
        if (curr?.open && !prev?.open) {
          show_menu(view);
        } else if (!curr?.open && prev?.open) {
          hide_menu();
        }
        original_update?.(view, prev_state);
      },
      destroy() {
        hide_menu();
        if (menu_container) {
          menu_container.remove();
          menu_container = null;
        }
        inner.destroy?.();
      },
    };
  };

  return { plugins: [plugin] };
}

export { image_context_menu_plugin_key };
