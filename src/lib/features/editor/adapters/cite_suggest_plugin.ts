import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  create_cursor_anchor,
  position_suggest_dropdown,
  scroll_selected_into_view,
  attach_outside_dismiss,
  mount_dropdown,
  destroy_dropdown,
} from "./suggest_dropdown_utils";

export const cite_suggest_plugin_key = new PluginKey<CiteSuggestState>(
  "cite-suggest",
);

export type CiteSuggestionItem = {
  citekey: string;
  title: string;
  authors: string;
  year: string;
};

type CiteSuggestState = {
  active: boolean;
  query: string;
  from: number;
  items: CiteSuggestionItem[];
  selected_index: number;
};

export type CiteSuggestPluginConfig = {
  on_query: (query: string) => void;
  on_dismiss: () => void;
  on_accept: (citekey: string) => void;
};

const EMPTY_STATE: CiteSuggestState = {
  active: false,
  query: "",
  from: 0,
  items: [],
  selected_index: 0,
};

export function extract_cite_query(
  text_before: string,
): { query: string; from_offset: number } | null {
  if (text_before.length === 0) return null;

  const open_idx = text_before.lastIndexOf("[@");
  if (open_idx === -1) return null;

  if (open_idx > 0 && text_before[open_idx - 1] === "[") return null;

  const query = text_before.slice(open_idx + 2);

  if (query.includes("]") || query.includes("\n")) return null;

  return { query, from_offset: open_idx };
}

function create_dropdown(): HTMLElement {
  const el = document.createElement("div");
  el.className = "CiteSuggest";
  return el;
}

function render_items(
  dropdown: HTMLElement,
  items: CiteSuggestionItem[],
  selected_index: number,
  on_select: (index: number) => void,
) {
  dropdown.innerHTML = "";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "CiteSuggest__item";
    if (i === selected_index) row.classList.add("CiteSuggest__item--selected");

    const content = document.createElement("div");
    content.className = "CiteSuggest__content";

    const primary = document.createElement("span");
    primary.className = "CiteSuggest__label";
    primary.textContent = item.authors || item.citekey;

    const secondary = document.createElement("span");
    secondary.className = "CiteSuggest__meta";
    secondary.textContent = item.title;

    content.appendChild(primary);
    content.appendChild(secondary);

    const badge = document.createElement("span");
    badge.className = "CiteSuggest__badge";
    badge.textContent = item.year;

    row.appendChild(content);
    row.appendChild(badge);

    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      on_select(i);
    });
    dropdown.appendChild(row);
  }
}

export function create_cite_suggest_prose_plugin(
  config: CiteSuggestPluginConfig,
): Plugin<CiteSuggestState> {
  let dropdown: HTMLElement | null = null;
  let is_visible = false;
  let debounce_timer: ReturnType<typeof setTimeout> | null = null;
  let suppress_next_activation = false;
  let dismissed_query: string | null = null;
  let dismissed_from: number | null = null;
  let detach_dismiss: (() => void) | null = null;

  function get_state(view: EditorView): CiteSuggestState {
    return cite_suggest_plugin_key.getState(view.state) ?? EMPTY_STATE;
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

  function dismiss(view: EditorView, lock_query: boolean) {
    if (debounce_timer) clearTimeout(debounce_timer);
    debounce_timer = null;

    const current = get_state(view);
    if (!current.active && current.items.length === 0) return;

    if (lock_query && current.active) {
      dismissed_query = current.query;
      dismissed_from = current.from;
    } else {
      dismissed_query = null;
      dismissed_from = null;
    }

    view.dispatch(view.state.tr.setMeta(cite_suggest_plugin_key, EMPTY_STATE));
    config.on_dismiss();
    hide_dropdown();
  }

  function accept(view: EditorView, index: number) {
    if (debounce_timer) clearTimeout(debounce_timer);
    debounce_timer = null;

    const state = get_state(view);
    const item = state.items[index];
    if (!item) return;

    const replacement = `[@${item.citekey}]`;

    const selection_from = view.state.selection.from;
    const replace_to = Math.min(selection_from, view.state.doc.content.size);
    const tr = view.state.tr.replaceWith(
      state.from,
      replace_to,
      view.state.schema.text(replacement),
    );
    tr.setSelection(
      TextSelection.create(tr.doc, state.from + replacement.length),
    );
    tr.setMeta(cite_suggest_plugin_key, EMPTY_STATE);
    view.dispatch(tr);
    view.focus();
    suppress_next_activation = true;
    dismissed_query = null;
    dismissed_from = null;
    config.on_accept(item.citekey);
    config.on_dismiss();
    hide_dropdown();
  }

  function sync_dropdown(view: EditorView, state: CiteSuggestState) {
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

  return new Plugin<CiteSuggestState>({
    key: cite_suggest_plugin_key,

    state: {
      init: () => EMPTY_STATE,
      apply(tr, prev) {
        const meta = tr.getMeta(cite_suggest_plugin_key) as
          | CiteSuggestState
          | { items: CiteSuggestionItem[]; query?: string }
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
        dismiss(editor_view, true),
      );

      return {
        update(view) {
          const { state: editor_state } = view;
          const plugin_state = get_state(view);

          if (!editor_state.selection.empty) {
            if (plugin_state.active) dismiss(view, false);
            sync_dropdown(view, EMPTY_STATE);
            return;
          }

          const $from = editor_state.selection.$from;
          if (
            !$from.parent.isTextblock ||
            $from.parent.type.name === "code_block"
          ) {
            if (plugin_state.active) dismiss(view, false);
            dismissed_query = null;
            dismissed_from = null;
            sync_dropdown(view, EMPTY_STATE);
            return;
          }

          const text_in_block = $from.parent.textBetween(0, $from.parentOffset);
          const result = extract_cite_query(text_in_block);

          if (!result) {
            if (plugin_state.active) dismiss(view, false);
            dismissed_query = null;
            dismissed_from = null;
            sync_dropdown(view, EMPTY_STATE);
            return;
          }

          const prose_from = $from.start() + result.from_offset;

          if (
            dismissed_query !== null &&
            dismissed_from !== null &&
            result.query === dismissed_query &&
            prose_from === dismissed_from
          ) {
            if (plugin_state.active) dismiss(view, false);
            sync_dropdown(view, EMPTY_STATE);
            return;
          }

          dismissed_query = null;
          dismissed_from = null;

          if (suppress_next_activation) {
            suppress_next_activation = false;
            if (plugin_state.active) dismiss(view, false);
            sync_dropdown(view, EMPTY_STATE);
            return;
          }

          if (result.query !== plugin_state.query || !plugin_state.active) {
            const new_state: CiteSuggestState = {
              active: true,
              query: result.query,
              from: prose_from,
              items: plugin_state.active ? plugin_state.items : [],
              selected_index: 0,
            };
            view.dispatch(
              view.state.tr.setMeta(cite_suggest_plugin_key, new_state),
            );

            if (debounce_timer) clearTimeout(debounce_timer);
            debounce_timer = setTimeout(() => {
              config.on_query(result.query);
            }, 50);
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
            view.state.tr.setMeta(cite_suggest_plugin_key, {
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
            view.state.tr.setMeta(cite_suggest_plugin_key, {
              ...state,
              selected_index: prev,
            }),
          );
          sync_dropdown(view, { ...state, selected_index: prev });
          return true;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          accept(view, state.selected_index);
          return true;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          dismiss(view, true);
          sync_dropdown(view, EMPTY_STATE);
          return true;
        }

        return false;
      },
    },
  });
}

export function set_cite_suggestions(
  view: EditorView,
  items: CiteSuggestionItem[],
) {
  view.dispatch(view.state.tr.setMeta(cite_suggest_plugin_key, { items }));
}
