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

type SuggestState<TItem> = {
  active: boolean;
  query: string;
  from: number;
  items: TItem[];
  selected_index: number;
};

type ExtractResult = {
  query: string;
  from_offset: number;
  dismiss_key?: string;
};

type SuggestConfig<TItem> = {
  key: PluginKey<SuggestState<TItem>>;
  class_name: string;
  extract: (text_before: string) => ExtractResult | null;
  render_items: (
    dropdown: HTMLElement,
    items: TItem[],
    selected_index: number,
    on_select: (index: number) => void,
  ) => void;
  accept: (view: EditorView, item: TItem, state: SuggestState<TItem>) => void;
  on_query: (query: string) => void;
  on_dismiss: () => void;
  on_accepted?: () => void;
  debounce_ms?: number;
  handle_tab?: (
    view: EditorView,
    state: SuggestState<TItem>,
    accept_fn: (view: EditorView, index: number) => void,
  ) => boolean;
  query_changed?: (prev: SuggestState<TItem>, result: ExtractResult) => boolean;
};

function create_empty_state<TItem>(): SuggestState<TItem> {
  return {
    active: false,
    query: "",
    from: 0,
    items: [],
    selected_index: 0,
  };
}

export type { SuggestState, SuggestConfig, ExtractResult };

export function create_suggest_prose_plugin<TItem>(
  config: SuggestConfig<TItem>,
): Plugin<SuggestState<TItem>> {
  const EMPTY: SuggestState<TItem> = create_empty_state();
  const debounce_ms = config.debounce_ms ?? 50;

  let dropdown: HTMLElement | null = null;
  let is_visible = false;
  let debounce_timer: ReturnType<typeof setTimeout> | null = null;
  let suppress_next_activation = false;
  let dismissed_query: string | null = null;
  let dismissed_from: number | null = null;
  let detach_dismiss: (() => void) | null = null;

  function get_state(view: EditorView): SuggestState<TItem> {
    return config.key.getState(view.state) ?? EMPTY;
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

    view.dispatch(view.state.tr.setMeta(config.key, EMPTY));
    config.on_dismiss();
    hide_dropdown();
  }

  function accept(view: EditorView, index: number) {
    if (debounce_timer) clearTimeout(debounce_timer);
    debounce_timer = null;

    const state = get_state(view);
    const item = state.items[index];
    if (!item) return;

    config.accept(view, item, state);

    suppress_next_activation = true;
    dismissed_query = null;
    dismissed_from = null;
    config.on_accepted?.();
    config.on_dismiss();
    hide_dropdown();
  }

  function sync_dropdown(view: EditorView, state: SuggestState<TItem>) {
    if (!dropdown) return;

    if (!state.active || state.items.length === 0) {
      hide_dropdown();
      return;
    }

    config.render_items(dropdown, state.items, state.selected_index, (i) => {
      accept(view, i);
    });

    scroll_selected_into_view(dropdown, state.selected_index);

    if (!is_visible || state.active) {
      show_dropdown(view);
    }
  }

  return new Plugin<SuggestState<TItem>>({
    key: config.key,

    state: {
      init: () => EMPTY,
      apply(tr, prev) {
        const meta = tr.getMeta(config.key) as
          | SuggestState<TItem>
          | { items: TItem[]; query?: string }
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
      dropdown = document.createElement("div");
      dropdown.className = config.class_name;
      mount_dropdown(dropdown);
      detach_dismiss = attach_outside_dismiss(dropdown, editor_view.dom, () => {
        dismiss(editor_view, true);
      });

      return {
        update(view) {
          const { state: editor_state } = view;
          const plugin_state = get_state(view);

          if (!editor_state.selection.empty) {
            if (plugin_state.active) dismiss(view, false);
            sync_dropdown(view, EMPTY);
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
            sync_dropdown(view, EMPTY);
            return;
          }

          const text_in_block = $from.parent.textBetween(0, $from.parentOffset);
          const result = config.extract(text_in_block);

          if (!result) {
            if (plugin_state.active) dismiss(view, false);
            dismissed_query = null;
            dismissed_from = null;
            sync_dropdown(view, EMPTY);
            return;
          }

          const prose_from = $from.start() + result.from_offset;
          const dismiss_key = result.dismiss_key ?? result.query;

          if (
            dismissed_query !== null &&
            dismissed_from !== null &&
            dismiss_key === dismissed_query &&
            prose_from === dismissed_from
          ) {
            if (plugin_state.active) dismiss(view, false);
            sync_dropdown(view, EMPTY);
            return;
          }

          dismissed_query = null;
          dismissed_from = null;

          if (suppress_next_activation) {
            suppress_next_activation = false;
            if (plugin_state.active) dismiss(view, false);
            sync_dropdown(view, EMPTY);
            return;
          }

          const changed = config.query_changed
            ? config.query_changed(plugin_state, result)
            : result.query !== plugin_state.query || !plugin_state.active;

          if (changed) {
            const new_state: SuggestState<TItem> = {
              active: true,
              query: result.query,
              from: prose_from,
              items: plugin_state.active ? plugin_state.items : [],
              selected_index: 0,
            };
            view.dispatch(view.state.tr.setMeta(config.key, new_state));

            if (debounce_timer) clearTimeout(debounce_timer);
            debounce_timer = setTimeout(() => {
              config.on_query(result.query);
            }, debounce_ms);
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
            view.state.tr.setMeta(config.key, {
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
            view.state.tr.setMeta(config.key, {
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
          if (config.handle_tab) {
            event.preventDefault();
            event.stopPropagation();
            return config.handle_tab(view, state, accept);
          }
          return false;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          dismiss(view, true);
          sync_dropdown(view, EMPTY);
          return true;
        }

        return false;
      },
    },
  });
}
