import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type { MarksmanCodeAction } from "$lib/features/marksman";
import { Lightbulb } from "lucide-static";
import { line_and_character_from_pos } from "./lsp_plugin_utils";
import {
  position_suggest_dropdown,
  mount_dropdown,
  destroy_dropdown,
  attach_outside_dismiss,
} from "./suggest_dropdown_utils";

const lsp_code_action_plugin_key = new PluginKey<DecorationSet>(
  "lsp-code-actions",
);

type PluginMeta =
  | { type: "set_actions"; actions: MarksmanCodeAction[]; widget_pos: number }
  | { type: "clear" };

type LspAction = {
  title: string;
  kind: string | null;
  data: string | null;
  raw_json: string;
  source: string;
};

export function create_lsp_code_action_plugin(input: {
  on_code_actions: (
    start_line: number,
    start_character: number,
    end_line: number,
    end_character: number,
  ) => Promise<MarksmanCodeAction[]>;
  on_resolve: (action: MarksmanCodeAction) => void;
  on_lsp_code_actions?:
    | ((
        start_line: number,
        start_character: number,
        end_line: number,
        end_character: number,
      ) => Promise<LspAction[]>)
    | undefined;
  on_lsp_resolve?: ((action: LspAction) => void) | undefined;
}): Plugin {
  let current_actions: MarksmanCodeAction[] = [];
  let current_lsp_actions: LspAction[] | null = null;
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
    if (current_lsp_actions) {
      render_dropdown_lsp(view, current_lsp_actions);
    } else {
      render_dropdown(view);
    }
    show_dropdown(anchor);
  }

  function render_dropdown(view: EditorView) {
    if (!dropdown) return;
    dropdown.innerHTML = "";
    for (const action of current_actions) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "LspCodeAction__item";
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

  function fetch_and_show_lsp(view: EditorView) {
    if (!input.on_lsp_code_actions) return;
    const { from, to } = view.state.selection;
    const from_coords = line_and_character_from_pos(view, from);
    const to_coords = line_and_character_from_pos(view, to);

    void input
      .on_lsp_code_actions(
        from_coords.line,
        from_coords.character,
        to_coords.line,
        to_coords.character,
      )
      .then((actions) => {
        current_lsp_actions = actions;
        current_actions = actions as MarksmanCodeAction[];
        if (actions.length === 0) {
          view.dispatch(
            view.state.tr.setMeta(lsp_code_action_plugin_key, {
              type: "clear",
            }),
          );
          return;
        }
        view.dispatch(
          view.state.tr.setMeta(lsp_code_action_plugin_key, {
            type: "set_actions",
            actions: actions as MarksmanCodeAction[],
            widget_pos: view.state.selection.from,
          }),
        );
        requestAnimationFrame(() => {
          const lightbulb = view.dom.querySelector(
            ".lsp-lightbulb",
          ) as HTMLElement | null;
          if (lightbulb) {
            render_dropdown_lsp(view, actions);
            show_dropdown(lightbulb);
          }
        });
      });
  }

  function categorize_action(kind: string | null): string {
    if (!kind) return "Other";
    if (kind.startsWith("custom.")) return "IWE";
    if (kind.startsWith("refactor.")) return "Refactor";
    return "Other";
  }

  function render_dropdown_lsp(view: EditorView, actions: LspAction[]) {
    if (!dropdown) return;
    dropdown.innerHTML = "";

    const groups = new Map<string, LspAction[]>();
    const group_order = ["IWE", "Refactor", "Other"];
    for (const action of actions) {
      const category = categorize_action(action.kind);
      const list = groups.get(category);
      if (list) list.push(action);
      else groups.set(category, [action]);
    }

    let rendered_count = 0;
    for (const category of group_order) {
      const group_actions = groups.get(category);
      if (!group_actions) continue;

      if (rendered_count > 0) {
        const divider = document.createElement("div");
        divider.className = "LspCodeAction__divider";
        dropdown.appendChild(divider);
      }

      if (groups.size > 1) {
        const header = document.createElement("div");
        header.className = "LspCodeAction__header";
        header.textContent = category;
        dropdown.appendChild(header);
      }

      for (const action of group_actions) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "LspCodeAction__item";
        item.textContent = action.title;
        item.addEventListener("mousedown", (e) => {
          e.preventDefault();
          hide_dropdown();
          input.on_lsp_resolve?.(action);
          view.focus();
        });
        dropdown.appendChild(item);
      }
      rendered_count++;
    }
  }

  function fetch_and_show(view: EditorView) {
    current_lsp_actions = null;
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
            view.state.tr.setMeta(lsp_code_action_plugin_key, {
              type: "clear",
            }),
          );
          return;
        }
        view.dispatch(
          view.state.tr.setMeta(lsp_code_action_plugin_key, {
            type: "set_actions",
            actions,
            widget_pos: view.state.selection.from,
          }),
        );
        requestAnimationFrame(() => {
          const lightbulb = view.dom.querySelector(
            ".lsp-lightbulb",
          ) as HTMLElement | null;
          if (lightbulb) {
            render_dropdown(view);
            show_dropdown(lightbulb);
          }
        });
      });
  }

  return new Plugin<DecorationSet>({
    key: lsp_code_action_plugin_key,

    state: {
      init: () => DecorationSet.empty,
      apply(tr, prev) {
        const meta = tr.getMeta(lsp_code_action_plugin_key) as
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
                el.className = "lsp-lightbulb";
                el.innerHTML = Lightbulb;
                el.title = `${String(meta.actions.length)} code action${meta.actions.length > 1 ? "s" : ""} available`;
                el.addEventListener("mousedown", (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggle_dropdown(el, view as EditorView);
                });
                return el;
              },
              { side: -1, key: "lsp-lightbulb" },
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
      dropdown.className = "LspCodeAction";
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
            current_lsp_actions = null;
            view.dispatch(
              view.state.tr.setMeta(lsp_code_action_plugin_key, {
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
          current_lsp_actions = null;
        },
      };
    },

    props: {
      decorations(state) {
        return (
          lsp_code_action_plugin_key.getState(state) ?? DecorationSet.empty
        );
      },
      handleKeyDown(view, event) {
        if (event.key === "Escape" && is_dropdown_visible) {
          hide_dropdown();
          return true;
        }
        if (event.key === "." && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          if (input.on_lsp_code_actions) {
            fetch_and_show_lsp(view);
          } else {
            fetch_and_show(view);
          }
          return true;
        }
        return false;
      },
    },
  });
}
