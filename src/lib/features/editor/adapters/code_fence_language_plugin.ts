import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  create_cursor_anchor,
  position_suggest_dropdown,
  scroll_selected_into_view,
  attach_outside_dismiss,
  mount_dropdown,
  destroy_dropdown,
} from "./suggest_dropdown_utils";
import {
  search_languages,
  POPULAR_LANGUAGES,
  type LanguageEntry,
} from "./language_registry";
import { schema } from "./schema";

export const code_fence_language_plugin_key = new PluginKey<CodeFenceLangState>(
  "code-fence-language",
);

export type CodeFenceLangState = {
  active: boolean;
  query: string;
  from: number;
  selected_index: number;
};

const EMPTY_STATE: CodeFenceLangState = {
  active: false,
  query: "",
  from: 0,
  selected_index: 0,
};

export function extract_code_fence_query(
  text: string,
): { query: string } | null {
  const match = /^(`{3})(\w*)$/.exec(text);
  if (!match) return null;
  return { query: match[2] ?? "" };
}

export function get_filtered_languages(query: string): LanguageEntry[] {
  const result = search_languages(query);
  if (!query) return result.popular;
  return result.all;
}

function create_dropdown(): HTMLElement {
  const el = document.createElement("div");
  el.className = "CodeFenceLangPicker";
  return el;
}

function render_items(
  dropdown: HTMLElement,
  items: LanguageEntry[],
  selected_index: number,
  on_select: (index: number) => void,
) {
  dropdown.innerHTML = "";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "CodeFenceLangPicker__item";
    if (i === selected_index)
      row.classList.add("CodeFenceLangPicker__item--selected");
    row.textContent = item.label;
    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      on_select(i);
    });
    dropdown.appendChild(row);
  }
}

export function create_code_fence_language_prose_plugin(): Plugin<CodeFenceLangState> {
  let dropdown: HTMLElement | null = null;
  let is_visible = false;
  let cached_items: LanguageEntry[] = POPULAR_LANGUAGES;
  let detach_dismiss: (() => void) | null = null;

  function get_state(view: EditorView): CodeFenceLangState {
    return code_fence_language_plugin_key.getState(view.state) ?? EMPTY_STATE;
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
    const current = get_state(view);
    if (!current.active) return;
    view.dispatch(
      view.state.tr.setMeta(code_fence_language_plugin_key, EMPTY_STATE),
    );
    hide_dropdown();
  }

  function accept(view: EditorView, index: number) {
    const item = cached_items[index];
    if (!item) return;

    const { $from } = view.state.selection;
    const block_start = $from.before();
    const block_end = $from.after();
    const code_block_node = schema.nodes.code_block.create({
      language: item.id,
    });
    const tr = view.state.tr.replaceWith(
      block_start,
      block_end,
      code_block_node,
    );
    tr.setMeta(code_fence_language_plugin_key, EMPTY_STATE);
    view.dispatch(tr);
    view.focus();
    hide_dropdown();
  }

  function sync_dropdown(view: EditorView, state: CodeFenceLangState) {
    if (!dropdown) return;
    if (!state.active || cached_items.length === 0) {
      hide_dropdown();
      return;
    }
    render_items(dropdown, cached_items, state.selected_index, (i) => {
      accept(view, i);
    });
    scroll_selected_into_view(dropdown, state.selected_index);
    if (!is_visible) {
      show_dropdown(view);
    }
  }

  return new Plugin<CodeFenceLangState>({
    key: code_fence_language_plugin_key,

    state: {
      init: () => EMPTY_STATE,
      apply(tr, prev) {
        const meta = tr.getMeta(code_fence_language_plugin_key) as
          | CodeFenceLangState
          | undefined;
        if (meta) return meta;
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
          const plugin_state = get_state(view);

          if (!editor_state.selection.empty) {
            if (plugin_state.active) dismiss(view);
            return;
          }

          const $from = editor_state.selection.$from;
          if (
            !$from.parent.isTextblock ||
            $from.parent.type.name === "code_block"
          ) {
            if (plugin_state.active) dismiss(view);
            return;
          }

          const text_in_block = $from.parent.textBetween(0, $from.parentOffset);
          const result = extract_code_fence_query(text_in_block);

          if (!result) {
            if (plugin_state.active) dismiss(view);
            return;
          }

          if (result.query !== plugin_state.query || !plugin_state.active) {
            cached_items = get_filtered_languages(result.query);
            const new_state: CodeFenceLangState = {
              active: true,
              query: result.query,
              from: $from.start(),
              selected_index: 0,
            };
            view.dispatch(
              view.state.tr.setMeta(code_fence_language_plugin_key, new_state),
            );
          }

          sync_dropdown(view, get_state(view));
        },
        destroy() {
          destroy_dropdown(dropdown, detach_dismiss);
          dropdown = null;
          detach_dismiss = null;
          is_visible = false;
        },
      };
    },

    props: {
      handleKeyDown(view, event) {
        const state = get_state(view);
        if (!state.active || cached_items.length === 0) return false;

        if (event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          const next = Math.min(
            state.selected_index + 1,
            cached_items.length - 1,
          );
          view.dispatch(
            view.state.tr.setMeta(code_fence_language_plugin_key, {
              ...state,
              selected_index: next,
            }),
          );
          return true;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          const prev = Math.max(state.selected_index - 1, 0);
          view.dispatch(
            view.state.tr.setMeta(code_fence_language_plugin_key, {
              ...state,
              selected_index: prev,
            }),
          );
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
          dismiss(view);
          return true;
        }

        return false;
      },
    },
  });
}
