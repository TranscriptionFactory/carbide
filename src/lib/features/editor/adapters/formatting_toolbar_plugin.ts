import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { ToolbarVisibility } from "$lib/shared/types/editor_settings";

export type ToolbarConfig = {
  toolbar_visibility: ToolbarVisibility;
};

export const formatting_toolbar_plugin_key = new PluginKey(
  "formatting-toolbar",
);

export function create_formatting_toolbar_prose_plugin(
  config: ToolbarConfig,
  on_sticky_mount: (view: EditorView) => void,
  on_sticky_unmount: () => void,
): Plugin {
  let prev_mode: ToolbarVisibility | null = null;
  let sticky_mounted = false;

  return new Plugin({
    key: formatting_toolbar_plugin_key,
    view() {
      return {
        update(view) {
          const mode = config.toolbar_visibility;

          if (mode !== prev_mode) {
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
            return;
          }

          if (mode === "always_show") {
            if (!sticky_mounted) {
              on_sticky_mount(view);
              sticky_mounted = true;
            }
            return;
          }
        },
        destroy() {
          if (sticky_mounted) {
            on_sticky_unmount();
            sticky_mounted = false;
          }
        },
      };
    },
  });
}
