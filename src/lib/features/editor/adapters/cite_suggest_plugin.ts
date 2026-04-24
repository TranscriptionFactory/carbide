import { PluginKey, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  create_suggest_prose_plugin,
  type SuggestState,
} from "./suggest_plugin_factory";

export const cite_suggest_plugin_key = new PluginKey<
  SuggestState<CiteSuggestionItem>
>("cite-suggest");

export type CiteSuggestionItem = {
  citekey: string;
  title: string;
  authors: string;
  year: string;
};

export type CiteSuggestPluginConfig = {
  on_query: (query: string) => void;
  on_dismiss: () => void;
  on_accept: (citekey: string) => void;
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
) {
  return create_suggest_prose_plugin<CiteSuggestionItem>({
    key: cite_suggest_plugin_key,
    class_name: "CiteSuggest",
    extract(text_before) {
      const result = extract_cite_query(text_before);
      if (!result) return null;
      return { query: result.query, from_offset: result.from_offset };
    },
    render_items,
    accept(view, item, state) {
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
      tr.setMeta(cite_suggest_plugin_key, {
        active: false,
        query: "",
        from: 0,
        items: [],
        selected_index: 0,
      });
      view.dispatch(tr);
      view.focus();
      config.on_accept(item.citekey);
    },
    on_query: config.on_query,
    on_dismiss: config.on_dismiss,
  });
}

export function set_cite_suggestions(
  view: EditorView,
  items: CiteSuggestionItem[],
) {
  view.dispatch(view.state.tr.setMeta(cite_suggest_plugin_key, { items }));
}
