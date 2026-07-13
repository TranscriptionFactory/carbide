import { PluginKey, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  create_suggest_prose_plugin,
  type SuggestState,
} from "./suggest_plugin_factory";
import type { DslSuggestion } from "$lib/shared/types/dsl_suggestion";

export type DslLanguage = "query" | "base";

type DslItem = DslSuggestion & { from_offset: number };

const plugin_keys: Record<DslLanguage, PluginKey<SuggestState<DslItem>>> = {
  query: new PluginKey<SuggestState<DslItem>>("dsl-suggest-query"),
  base: new PluginKey<SuggestState<DslItem>>("dsl-suggest-base"),
};

export type DslSuggestPluginConfig = {
  language: DslLanguage;
  on_query: (query: string) => void;
  on_dismiss: () => void;
};

function extract_dsl_query(
  text_before: string,
): { query: string; from_offset: number } {
  const token_match = text_before.match(/\S+$/);
  const from_offset = token_match ? text_before.length - token_match[0].length : text_before.length;
  return { query: text_before, from_offset };
}

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

export function create_dsl_suggest_prose_plugin(config: DslSuggestPluginConfig) {
  const key = plugin_keys[config.language];
  return create_suggest_prose_plugin<DslItem>({
    key,
    class_name: "DslSuggest",
    code_block_languages: [config.language],
    extract(text_before) {
      const { query, from_offset } = extract_dsl_query(text_before);
      return { query, from_offset };
    },
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
      if (state.items.length >= 1) {
        accept_fn(view, state.selected_index);
        return true;
      }
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
  const with_offset: DslItem[] = items.map((item) => ({ ...item, from_offset }));
  view.dispatch(
    view.state.tr.setMeta(plugin_keys[language], { items: with_offset }),
  );
}
