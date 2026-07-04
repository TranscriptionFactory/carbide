import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { mount, unmount } from "svelte";
import TagColorMenu from "../ui/tag_color_menu.svelte";
import {
  create_tag_pill_prose_plugin,
  tag_pill_plugin_key,
  type TagPillMenuConfig,
} from "../adapters/tag_pill_plugin";
import type { EditorExtension } from "./types";

export function create_tag_pill_extension(
  config?: TagPillMenuConfig,
): EditorExtension {
  const plugin = create_tag_pill_prose_plugin();
  if (!config) return { plugins: [plugin] };
  const menu_config = config;

  let menu_container: HTMLElement | null = null;
  let svelte_app: Record<string, unknown> | undefined;

  function show_menu(view: EditorView) {
    if (svelte_app) return;
    if (!menu_container) {
      menu_container = document.createElement("div");
      menu_container.className = "tag-color-menu-mount";
      document.body.appendChild(menu_container);
    }
    svelte_app = mount(TagColorMenu, {
      target: menu_container,
      props: {
        view,
        config: menu_config,
        on_close: () => {
          view.dispatch(
            view.state.tr.setMeta(tag_pill_plugin_key, { type: "close" }),
          );
        },
      },
    });
  }

  function hide_menu() {
    if (svelte_app) {
      void unmount(svelte_app);
      svelte_app = undefined;
    }
  }

  plugin.spec.view = () => ({
    update(view: EditorView, prev_state: EditorState) {
      const prev = tag_pill_plugin_key.getState(prev_state);
      const curr = tag_pill_plugin_key.getState(view.state);
      if (curr?.menu.open && !prev?.menu.open) {
        show_menu(view);
      } else if (!curr?.menu.open && prev?.menu.open) {
        hide_menu();
      }
    },
    destroy() {
      hide_menu();
      if (menu_container) {
        menu_container.remove();
        menu_container = null;
      }
    },
  });

  return { plugins: [plugin] };
}
