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
import { longest_common_prefix } from "$lib/shared/utils/longest_common_prefix";

export const tag_suggest_plugin_key = new PluginKey<TagSuggestState>(
  "tag-suggest",
);

type TagItem = { tag: string; count: number };

type TagSuggestState = {
  active: boolean;
  query: string;
  from: number;
  items: TagItem[];
  selected_index: number;
};

export type TagSuggestPluginConfig = {
  on_query: (query: string) => void;
  on_dismiss: () => void;
};

const EMPTY_STATE: TagSuggestState = {
  active: false,
  query: "",
  from: 0,
  items: [],
  selected_index: 0,
};

export function extract_tag_query(
  text_before: string,
): { query: string; offset: number } | null {
  if (text_before.length === 0) return null;

  const hash_idx = text_before.lastIndexOf("#");
  if (hash_idx === -1) return null;

  const before_hash = text_before.slice(0, hash_idx);
  const after_hash = text_before.slice(hash_idx + 1);

  if (after_hash.includes(" ") || after_hash.includes("\n")) return null;

  if (hash_idx > 0) {
    const preceding = before_hash[before_hash.length - 1];
    if (preceding !== " " && preceding !== "\n") return null;
  }

  const line_start = before_hash.lastIndexOf("\n") + 1;
  const text_on_line_before_hash = before_hash.slice(line_start);
  if (/^#+$/.test(text_on_line_before_hash)) return null;

  return { query: after_hash, offset: hash_idx };
}

function create_dropdown(): HTMLElement {
  const el = document.createElement("div");
  el.className = "TagSuggest";
  return el;
}

function render_items(
  dropdown: HTMLElement,
  items: TagItem[],
  selected_index: number,
  on_select: (index: number) => void,
) {
  dropdown.innerHTML = "";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "TagSuggest__item";
    if (i === selected_index) row.classList.add("TagSuggest__item--selected");

    const label = document.createElement("span");
    label.className = "TagSuggest__label";
    label.textContent = item.tag;

    const badge = document.createElement("span");
    badge.className = "TagSuggest__badge";
    badge.textContent = `${String(item.count)} notes`;

    row.appendChild(label);
    row.appendChild(badge);

    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      on_select(i);
    });
    dropdown.appendChild(row);
  }
}

export function create_tag_suggest_prose_plugin(
  config: TagSuggestPluginConfig,
): Plugin<TagSuggestState> {
  let dropdown: HTMLElement | null = null;
  let is_visible = false;
  let debounce_timer: ReturnType<typeof setTimeout> | null = null;
  let suppress_next_activation = false;
  let dismissed_query: string | null = null;
  let dismissed_from: number | null = null;
  let detach_dismiss: (() => void) | null = null;

  function get_state(view: EditorView): TagSuggestState {
    return tag_suggest_plugin_key.getState(view.state) ?? EMPTY_STATE;
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

    view.dispatch(view.state.tr.setMeta(tag_suggest_plugin_key, EMPTY_STATE));
    config.on_dismiss();
    hide_dropdown();
  }

  function accept(view: EditorView, index: number) {
    if (debounce_timer) clearTimeout(debounce_timer);
    debounce_timer = null;

    const state = get_state(view);
    const item = state.items[index];
    if (!item) return;
    const replacement = `#${item.tag}`;
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
    tr.setMeta(tag_suggest_plugin_key, EMPTY_STATE);
    view.dispatch(tr);
    view.focus();
    suppress_next_activation = true;
    dismissed_query = null;
    dismissed_from = null;
    config.on_dismiss();
    hide_dropdown();
  }

  function sync_dropdown(view: EditorView, state: TagSuggestState) {
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

  return new Plugin<TagSuggestState>({
    key: tag_suggest_plugin_key,

    state: {
      init: () => EMPTY_STATE,
      apply(tr, prev) {
        const meta = tr.getMeta(tag_suggest_plugin_key) as
          | TagSuggestState
          | { items: TagItem[]; query?: string }
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
          const result = extract_tag_query(text_in_block);

          if (!result) {
            if (plugin_state.active) dismiss(view, false);
            dismissed_query = null;
            dismissed_from = null;
            sync_dropdown(view, EMPTY_STATE);
            return;
          }

          const prose_from = $from.start() + result.offset;

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
            const new_state: TagSuggestState = {
              active: true,
              query: result.query,
              from: prose_from,
              items: plugin_state.active ? plugin_state.items : [],
              selected_index: 0,
            };
            view.dispatch(
              view.state.tr.setMeta(tag_suggest_plugin_key, new_state),
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
            view.state.tr.setMeta(tag_suggest_plugin_key, {
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
            view.state.tr.setMeta(tag_suggest_plugin_key, {
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

        if (event.key === "Tab" && !event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();

          if (state.items.length === 1) {
            accept(view, 0);
            return true;
          }

          const tags_lower = state.items.map((item) => item.tag.toLowerCase());
          const query_lower = state.query.toLowerCase();
          const prefix = longest_common_prefix(tags_lower);

          if (prefix.length > query_lower.length) {
            const completion = (state.items[0]?.tag ?? "").slice(
              0,
              prefix.length,
            );
            const insert_from = state.from + 1;
            const insert_to = view.state.selection.from;
            const tr = view.state.tr.replaceWith(
              insert_from,
              insert_to,
              view.state.schema.text(completion),
            );
            tr.setSelection(
              TextSelection.create(tr.doc, insert_from + completion.length),
            );
            view.dispatch(tr);
          }

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

export function set_tag_suggestions(
  view: EditorView,
  items: Array<{ tag: string; count: number }>,
) {
  view.dispatch(view.state.tr.setMeta(tag_suggest_plugin_key, { items }));
}
