import { PluginKey, TextSelection, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  create_suggest_prose_plugin,
  type SuggestState,
} from "./suggest_plugin_factory";
import type { DslSuggestion } from "$lib/shared/types/dsl_suggestion";

export type DslLanguage = "query" | "base" | "tasks";

type DslItem = DslSuggestion & { from_offset: number };

const plugin_keys: Record<DslLanguage, PluginKey<SuggestState<DslItem>>> = {
  query: new PluginKey<SuggestState<DslItem>>("dsl-suggest-query"),
  base: new PluginKey<SuggestState<DslItem>>("dsl-suggest-base"),
  tasks: new PluginKey<SuggestState<DslItem>>("dsl-suggest-tasks"),
};

// Read by the code-block view: while a suggestion is on screen, Tab and the
// arrows belong to the menu instead of fence indentation / the exit-paragraph
// shortcuts. Only a populated list counts — the provider answers through a
// debounce, and a key no handler claims would fall through to the browser.
export function has_active_dsl_suggest(state: EditorState): boolean {
  for (const key of Object.values(plugin_keys)) {
    const plugin_state = key.getState(state);
    if (plugin_state?.active && plugin_state.items.length > 0) return true;
  }
  return false;
}

export type DslSuggestPluginConfig = {
  language: DslLanguage;
  on_query: (query: string) => void;
  on_dismiss: () => void;
};

function render_items(
  dropdown: HTMLElement,
  items: DslItem[],
  selected_index: number,
  on_select: (index: number) => void,
) {
  dropdown.innerHTML = "";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "DslSuggest__item";
    if (i === selected_index) row.classList.add("DslSuggest__item--selected");

    const label = document.createElement("span");
    label.className = "DslSuggest__label";
    label.textContent = item.label;
    row.appendChild(label);

    if (item.detail) {
      const badge = document.createElement("span");
      badge.className = "DslSuggest__badge";
      badge.textContent = item.detail;
      row.appendChild(badge);
    }

    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      on_select(i);
    });
    dropdown.appendChild(row);
  }
}

export function create_dsl_suggest_prose_plugin(
  config: DslSuggestPluginConfig,
) {
  const key = plugin_keys[config.language];
  return create_suggest_prose_plugin<DslItem>({
    key,
    class_name: "DslSuggest",
    code_block_languages: [config.language],
    // replacement position comes from the provider via per-item from_offset;
    // the factory's from_offset only keys dismissal dedup, where query suffices
    extract: (text_before) => ({ query: text_before, from_offset: 0 }),
    render_items,
    accept(view, item) {
      const block_start = view.state.selection.$from.start();
      const replace_from = block_start + item.from_offset;
      const replace_to = Math.min(
        view.state.selection.from,
        view.state.doc.content.size,
      );
      const tr = view.state.tr.replaceWith(
        replace_from,
        replace_to,
        view.state.schema.text(item.insert),
      );
      tr.setSelection(
        TextSelection.create(tr.doc, replace_from + item.insert.length),
      );
      tr.setMeta(key, {
        active: false,
        query: "",
        from: 0,
        items: [],
        selected_index: 0,
      });
      view.dispatch(tr);
      view.focus();
    },
    on_query: config.on_query,
    on_dismiss: config.on_dismiss,
    handle_tab(view, state, accept_fn) {
      accept_fn(view, state.selected_index);
      return true;
    },
  });
}

export function set_dsl_suggestions(
  view: EditorView,
  language: DslLanguage,
  items: DslSuggestion[],
  from_offset: number,
) {
  const with_offset: DslItem[] = items.map((item) => ({
    ...item,
    from_offset,
  }));
  view.dispatch(
    view.state.tr.setMeta(plugin_keys[language], { items: with_offset }),
  );
}
