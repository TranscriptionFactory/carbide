import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { IweCompletionItem } from "$lib/features/iwe";
import {
  create_cursor_anchor,
  position_suggest_dropdown,
  scroll_selected_into_view,
  attach_outside_dismiss,
  mount_dropdown,
  destroy_dropdown,
} from "./suggest_dropdown_utils";
import { line_and_character_from_pos } from "./iwe_plugin_utils";
import { wiki_suggest_plugin_key } from "./wiki_suggest_plugin";

export const iwe_completion_plugin_key = new PluginKey<IweCompletionState>(
  "iwe-completion",
);

type IweCompletionState = {
  active: boolean;
  items: IweCompletionItem[];
  selected_index: number;
  from: number;
  query: string;
};

const EMPTY_STATE: IweCompletionState = {
  active: false,
  items: [],
  selected_index: 0,
  from: 0,
  query: "",
};

function create_dropdown(): HTMLElement {
  const el = document.createElement("div");
  el.className = "IweCompletion";
  return el;
}

function render_items(
  dropdown: HTMLElement,
  items: IweCompletionItem[],
  selected_index: number,
  on_select: (index: number) => void,
) {
  dropdown.innerHTML = "";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "IweCompletion__item";
    if (i === selected_index)
      row.classList.add("IweCompletion__item--selected");

    const label = document.createElement("span");
    label.className = "IweCompletion__label";
    label.textContent = item.label;
    row.appendChild(label);

    if (item.detail) {
      const detail = document.createElement("span");
      detail.className = "IweCompletion__detail";
      detail.textContent = item.detail;
      row.appendChild(detail);
    }

    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      on_select(i);
    });
    dropdown.appendChild(row);
  }
}

function word_before_cursor(
  view: EditorView,
): { word: string; from: number } | null {
  if (wiki_suggest_plugin_key.getState(view.state)?.active) return null;
  const { $from } = view.state.selection;
  if (!$from.parent.isTextblock || $from.parent.type.name === "code_block") {
    return null;
  }
  const text_in_block = $from.parent.textBetween(0, $from.parentOffset);
  const match = /[\w-]+$/.exec(text_in_block);
  if (!match) return null;
  return { word: match[0], from: $from.pos - match[0].length };
}

export function create_iwe_completion_plugin(input: {
  on_completion: (
    line: number,
    character: number,
  ) => Promise<IweCompletionItem[]>;
}): Plugin<IweCompletionState> {
  let dropdown: HTMLElement | null = null;
  let is_visible = false;
  let debounce_timer: ReturnType<typeof setTimeout> | null = null;
  let detach_dismiss: (() => void) | null = null;

  function get_state(view: EditorView): IweCompletionState {
    return iwe_completion_plugin_key.getState(view.state) ?? EMPTY_STATE;
  }

  function show_dropdown(view: EditorView) {
    if (!dropdown) return;
    const anchor = create_cursor_anchor(view);
    dropdown.style.display = "block";
    is_visible = true;
    position_suggest_dropdown(dropdown, anchor);
  }

  function hide_dropdown() {
    if (!dropdown) return;
    dropdown.style.display = "none";
    is_visible = false;
  }

  function dismiss(view: EditorView) {
    if (debounce_timer) clearTimeout(debounce_timer);
    debounce_timer = null;
    const current = get_state(view);
    if (!current.active) return;
    view.dispatch(
      view.state.tr.setMeta(iwe_completion_plugin_key, EMPTY_STATE),
    );
    hide_dropdown();
  }

  function accept(view: EditorView, index: number) {
    if (debounce_timer) clearTimeout(debounce_timer);
    debounce_timer = null;
    const state = get_state(view);
    const item = state.items[index];
    if (!item) return;
    const insert = item.insert_text ?? item.label;
    const from = state.from;
    const to = view.state.selection.from;
    const tr = view.state.tr.replaceWith(
      from,
      to,
      view.state.schema.text(insert),
    );
    tr.setSelection(TextSelection.create(tr.doc, from + insert.length));
    tr.setMeta(iwe_completion_plugin_key, EMPTY_STATE);
    view.dispatch(tr);
    view.focus();
    hide_dropdown();
  }

  function sync_dropdown(view: EditorView, state: IweCompletionState) {
    if (!dropdown) return;
    if (!state.active || state.items.length === 0) {
      hide_dropdown();
      return;
    }
    render_items(dropdown, state.items, state.selected_index, (i) => {
      accept(view, i);
    });
    scroll_selected_into_view(dropdown, state.selected_index);
    if (!is_visible || state.active) {
      show_dropdown(view);
    }
  }

  return new Plugin<IweCompletionState>({
    key: iwe_completion_plugin_key,

    state: {
      init: () => EMPTY_STATE,
      apply(tr, prev) {
        const meta = tr.getMeta(iwe_completion_plugin_key) as
          | IweCompletionState
          | { items: IweCompletionItem[] }
          | undefined;
        if (meta) {
          if ("active" in meta) return meta;
          if ("items" in meta) {
            if (!prev.active) return prev;
            return { ...prev, items: meta.items, selected_index: 0 };
          }
        }
        return prev;
      },
    },

    view(editor_view) {
      dropdown = create_dropdown();
      mount_dropdown(dropdown);
      detach_dismiss = attach_outside_dismiss(dropdown, editor_view.dom, () =>
        dismiss(editor_view),
      );

      return {
        update(view) {
          const { state: editor_state } = view;
          if (!editor_state.selection.empty) {
            dismiss(view);
            return;
          }

          const context = word_before_cursor(view);
          if (!context || context.word.length < 2) {
            dismiss(view);
            return;
          }

          const plugin_state = get_state(view);
          if (context.word !== plugin_state.query || !plugin_state.active) {
            const new_state: IweCompletionState = {
              active: true,
              query: context.word,
              from: context.from,
              items: plugin_state.active ? plugin_state.items : [],
              selected_index: 0,
            };
            view.dispatch(
              view.state.tr.setMeta(iwe_completion_plugin_key, new_state),
            );

            if (debounce_timer) clearTimeout(debounce_timer);
            debounce_timer = setTimeout(() => {
              const pos = view.state.selection.from;
              const { line, character } = line_and_character_from_pos(
                view,
                pos,
              );
              void input.on_completion(line, character).then((items) => {
                if (!get_state(view).active) return;
                view.dispatch(
                  view.state.tr.setMeta(iwe_completion_plugin_key, { items }),
                );
                sync_dropdown(view, { ...get_state(view), items });
              });
            }, 200);
          }

          sync_dropdown(view, get_state(view));
        },
        destroy() {
          destroy_dropdown(dropdown, detach_dismiss);
          dropdown = null;
          detach_dismiss = null;
          is_visible = false;
          if (debounce_timer) clearTimeout(debounce_timer);
          debounce_timer = null;
        },
      };
    },

    props: {
      handleKeyDown(view, event) {
        const state = get_state(view);
        if (!state.active || state.items.length === 0) return false;

        if (event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          const next = Math.min(
            state.selected_index + 1,
            state.items.length - 1,
          );
          view.dispatch(
            view.state.tr.setMeta(iwe_completion_plugin_key, {
              ...state,
              selected_index: next,
            }),
          );
          sync_dropdown(view, { ...state, selected_index: next });
          return true;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          const prev = Math.max(state.selected_index - 1, 0);
          view.dispatch(
            view.state.tr.setMeta(iwe_completion_plugin_key, {
              ...state,
              selected_index: prev,
            }),
          );
          sync_dropdown(view, { ...state, selected_index: prev });
          return true;
        }

        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          accept(view, state.selected_index);
          return true;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          dismiss(view);
          return true;
        }

        return false;
      },
    },
  });
}
