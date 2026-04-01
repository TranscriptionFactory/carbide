import type { Plugin, EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { mount, unmount } from "svelte";
import FormattingToolbar from "../ui/formatting_toolbar.svelte";
import {
  create_formatting_toolbar_prose_plugin,
  formatting_toolbar_plugin_key,
} from "../adapters/formatting_toolbar_plugin";
import {
  type FormattingCommand,
  toggle_format,
} from "../adapters/formatting_toolbar_commands";
import type { EditorExtension } from "./types";

export function create_toolbar_extension(): EditorExtension {
  let toolbar_container: HTMLElement | null = null;
  let toolbar_view: EditorView | null = null;
  let svelte_app: Record<string, unknown> | undefined;

  function ensure_container(): HTMLElement {
    if (!toolbar_container) {
      toolbar_container = document.createElement("div");
      toolbar_container.className = "formatting-toolbar-mount";
      toolbar_container.style.display = "none";
    }
    return toolbar_container;
  }

  function mount_toolbar(view: EditorView) {
    if (svelte_app) return;
    const container = ensure_container();
    container.style.display = "";
    svelte_app = mount(FormattingToolbar, {
      target: container,
      props: {
        view,
        on_command: (command: FormattingCommand) => {
          toggle_format(command, view);
          view.focus();
        },
      },
    });
  }

  function hide_toolbar() {
    if (svelte_app) {
      void unmount(svelte_app);
      svelte_app = undefined;
    }
    if (toolbar_container) {
      toolbar_container.style.display = "none";
    }
    toolbar_view = null;
  }

  function show_toolbar(view: EditorView) {
    toolbar_view = view;
    mount_toolbar(view);
  }

  const plugin = create_formatting_toolbar_prose_plugin(
    ensure_container(),
    () => {
      if (toolbar_view) show_toolbar(toolbar_view);
    },
    () => hide_toolbar(),
  );

  const original_view = plugin.spec.view;
  plugin.spec.view = function plugin_view(prose_view: EditorView) {
    toolbar_view = prose_view;
    const inner = original_view?.(prose_view);
    if (!inner) return {};

    const original_update = inner.update;
    return {
      update(view: EditorView, prev_state: EditorState) {
        toolbar_view = view;
        original_update?.(view, prev_state);
      },
      destroy() {
        hide_toolbar();
        if (toolbar_container) {
          toolbar_container.remove();
          toolbar_container = null;
        }
        inner.destroy?.();
      },
    };
  };

  return { plugins: [plugin] };
}

export { formatting_toolbar_plugin_key };
