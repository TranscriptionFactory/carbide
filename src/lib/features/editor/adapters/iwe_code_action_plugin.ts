import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type { IweCodeAction } from "$lib/features/iwe";
import { line_and_character_from_pos } from "./iwe_plugin_utils";
import {
  position_suggest_dropdown,
  mount_dropdown,
  destroy_dropdown,
  attach_outside_dismiss,
} from "./suggest_dropdown_utils";

const iwe_code_action_plugin_key = new PluginKey<DecorationSet>(
  "iwe-code-actions",
);

type PluginMeta =
  | { type: "set_actions"; actions: IweCodeAction[]; widget_pos: number }
  | { type: "clear" };

export function create_iwe_code_action_plugin(input: {
  on_code_actions: (
    start_line: number,
    start_character: number,
    end_line: number,
    end_character: number,
  ) => Promise<IweCodeAction[]>;
  on_resolve: (action: IweCodeAction) => void;
}): Plugin {
  let current_actions: IweCodeAction[] = [];
  let dropdown: HTMLElement | null = null;
  let detach_dismiss: (() => void) | null = null;
  let is_dropdown_visible = false;

  function hide_dropdown() {
    if (!dropdown) return;
    dropdown.style.display = "none";
    is_dropdown_visible = false;
  }

  function show_dropdown(anchor: HTMLElement) {
    if (!dropdown) return;
    dropdown.style.display = "block";
    is_dropdown_visible = true;
    position_suggest_dropdown(dropdown, anchor);
  }

  function toggle_dropdown(anchor: HTMLElement, view: EditorView) {
    if (is_dropdown_visible) {
      hide_dropdown();
      return;
    }
    render_dropdown(view);
    show_dropdown(anchor);
  }

  function render_dropdown(view: EditorView) {
    if (!dropdown) return;
    dropdown.innerHTML = "";
    for (const action of current_actions) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "IweCodeAction__item";
      item.textContent = action.title;
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        hide_dropdown();
        input.on_resolve(action);
        view.focus();
      });
      dropdown.appendChild(item);
    }
  }

  function fetch_and_show(view: EditorView) {
    const { from, to } = view.state.selection;
    const from_coords = line_and_character_from_pos(view, from);
    const to_coords = line_and_character_from_pos(view, to);

    void input
      .on_code_actions(
        from_coords.line,
        from_coords.character,
        to_coords.line,
        to_coords.character,
      )
      .then((actions) => {
        current_actions = actions;
        if (actions.length === 0) {
          view.dispatch(
            view.state.tr.setMeta(iwe_code_action_plugin_key, {
              type: "clear",
            }),
          );
          return;
        }
        view.dispatch(
          view.state.tr.setMeta(iwe_code_action_plugin_key, {
            type: "set_actions",
            actions,
            widget_pos: view.state.selection.from,
          }),
        );
        requestAnimationFrame(() => {
          const lightbulb = view.dom.querySelector(
            ".iwe-lightbulb",
          ) as HTMLElement | null;
          if (lightbulb) {
            render_dropdown(view);
            show_dropdown(lightbulb);
          }
        });
      });
  }

  return new Plugin<DecorationSet>({
    key: iwe_code_action_plugin_key,

    state: {
      init: () => DecorationSet.empty,
      apply(tr, prev) {
        const meta = tr.getMeta(iwe_code_action_plugin_key) as
          | PluginMeta
          | undefined;
        if (meta) {
          if (meta.type === "clear") return DecorationSet.empty;
          if (meta.type === "set_actions") {
            const widget = Decoration.widget(
              meta.widget_pos,
              (view) => {
                const el = document.createElement("button");
                el.type = "button";
                el.className = "iwe-lightbulb";
                el.title = `${String(meta.actions.length)} code action${meta.actions.length > 1 ? "s" : ""} available`;
                el.addEventListener("mousedown", (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggle_dropdown(el, view as EditorView);
                });
                return el;
              },
              { side: -1, key: "iwe-lightbulb" },
            );
            return DecorationSet.create(tr.doc, [widget]);
          }
        }
        if (tr.docChanged || tr.selectionSet) {
          return DecorationSet.empty;
        }
        return prev.map(tr.mapping, tr.doc);
      },
    },

    view(editor_view) {
      dropdown = document.createElement("div");
      dropdown.className = "IweCodeAction";
      mount_dropdown(dropdown);
      detach_dismiss = attach_outside_dismiss(
        dropdown,
        editor_view.dom,
        hide_dropdown,
      );

      return {
        update(view, prev_state) {
          const sel = view.state.selection;
          const prev_sel = prev_state.selection;
          if (sel.from !== prev_sel.from || sel.to !== prev_sel.to) {
            hide_dropdown();
            view.dispatch(
              view.state.tr.setMeta(iwe_code_action_plugin_key, {
                type: "clear",
              }),
            );
          }
        },
        destroy() {
          destroy_dropdown(dropdown, detach_dismiss);
          dropdown = null;
          detach_dismiss = null;
          current_actions = [];
        },
      };
    },

    props: {
      decorations(state) {
        return (
          iwe_code_action_plugin_key.getState(state) ?? DecorationSet.empty
        );
      },
      handleKeyDown(view, event) {
        if (event.key === "Escape" && is_dropdown_visible) {
          hide_dropdown();
          return true;
        }
        if (event.key === "." && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          fetch_and_show(view);
          return true;
        }
        return false;
      },
    },
  });
}
