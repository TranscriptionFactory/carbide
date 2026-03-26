import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { MarksmanCompletionItem } from "$lib/features/marksman";
import {
  create_cursor_anchor,
  position_suggest_dropdown,
  scroll_selected_into_view,
  attach_outside_dismiss,
  mount_dropdown,
  destroy_dropdown,
} from "./suggest_dropdown_utils";
import { line_and_character_from_pos } from "./lsp_plugin_utils";
import { wiki_suggest_plugin_key } from "./wiki_suggest_plugin";

export const lsp_completion_plugin_key = new PluginKey<LspCompletionState>(
  "lsp-completion",
);

type LspCompletionState = {
  active: boolean;
  items: MarksmanCompletionItem[];
  selected_index: number;
  from: number;
  query: string;
};

const EMPTY_STATE: LspCompletionState = {
  active: false,
  items: [],
  selected_index: 0,
  from: 0,
  query: "",
};

function create_dropdown(): HTMLElement {
  const el = document.createElement("div");
  el.className = "LspCompletion";
  return el;
}

function render_items(
  dropdown: HTMLElement,
  items: MarksmanCompletionItem[],
  selected_index: number,
  on_select: (index: number) => void,
) {
  dropdown.innerHTML = "";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "LspCompletion__item";
    if (i === selected_index)
      row.classList.add("LspCompletion__item--selected");

    const label = document.createElement("span");
    label.className = "LspCompletion__label";
    label.textContent = item.label;
    row.appendChild(label);

    if (item.detail) {
      const detail = document.createElement("span");
      detail.className = "LspCompletion__detail";
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

function escape_regex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trigger_context(
  view: EditorView,
  trigger_chars: string[],
): { query: string; from: number } | null {
  if (trigger_chars.length === 0) return null;
  if (wiki_suggest_plugin_key.getState(view.state)?.active) return null;
  const { $from } = view.state.selection;
  if (!$from.parent.isTextblock || $from.parent.type.name === "code_block") {
    return null;
  }
  const text = $from.parent.textBetween(0, $from.parentOffset);
  const escaped = trigger_chars.map(escape_regex);
  const pattern = new RegExp(`(?:${escaped.join("|")})(\\S*)$`);
  const match = pattern.exec(text);
  if (!match) return null;
  const from = $from.pos - match[0].length;
  return { query: match[0], from };
}

export function create_lsp_completion_plugin(input: {
  on_completion: (
    line: number,
    character: number,
  ) => Promise<MarksmanCompletionItem[]>;
  get_trigger_characters: () => string[];
}): Plugin<LspCompletionState> {
  let dropdown: HTMLElement | null = null;
  let is_visible = false;
  let debounce_timer: ReturnType<typeof setTimeout> | null = null;
  let detach_dismiss: (() => void) | null = null;

  function get_state(view: EditorView): LspCompletionState {
    return lsp_completion_plugin_key.getState(view.state) ?? EMPTY_STATE;
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
      view.state.tr.setMeta(lsp_completion_plugin_key, EMPTY_STATE),
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
    tr.setMeta(lsp_completion_plugin_key, EMPTY_STATE);
    view.dispatch(tr);
    view.focus();
    hide_dropdown();
  }

  function sync_dropdown(view: EditorView, state: LspCompletionState) {
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

  return new Plugin<LspCompletionState>({
    key: lsp_completion_plugin_key,

    state: {
      init: () => EMPTY_STATE,
      apply(tr, prev) {
        const meta = tr.getMeta(lsp_completion_plugin_key) as
          | LspCompletionState
          | { items: MarksmanCompletionItem[] }
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

          const trigger_chars = input.get_trigger_characters();
          const context = trigger_context(view, trigger_chars);
          if (!context) {
            dismiss(view);
            return;
          }

          const plugin_state = get_state(view);
          if (context.query !== plugin_state.query || !plugin_state.active) {
            const new_state: LspCompletionState = {
              active: true,
              query: context.query,
              from: context.from,
              items: plugin_state.active ? plugin_state.items : [],
              selected_index: 0,
            };
            view.dispatch(
              view.state.tr.setMeta(lsp_completion_plugin_key, new_state),
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
                  view.state.tr.setMeta(lsp_completion_plugin_key, { items }),
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
            view.state.tr.setMeta(lsp_completion_plugin_key, {
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
            view.state.tr.setMeta(lsp_completion_plugin_key, {
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
