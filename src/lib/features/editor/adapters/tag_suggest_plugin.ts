import { PluginKey, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  create_suggest_prose_plugin,
  type SuggestState,
} from "./suggest_plugin_factory";
import { longest_common_prefix } from "$lib/shared/utils/longest_common_prefix";

export const tag_suggest_plugin_key = new PluginKey<SuggestState<TagItem>>(
  "tag-suggest",
);

type TagItem = { tag: string; count: number };

export type TagSuggestPluginConfig = {
  on_query: (query: string) => void;
  on_dismiss: () => void;
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
) {
  return create_suggest_prose_plugin<TagItem>({
    key: tag_suggest_plugin_key,
    class_name: "TagSuggest",
    extract(text_before) {
      const result = extract_tag_query(text_before);
      if (!result) return null;
      return { query: result.query, from_offset: result.offset };
    },
    render_items,
    accept(view, item, state) {
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
      tr.setMeta(tag_suggest_plugin_key, {
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
      if (state.items.length === 1) {
        accept_fn(view, 0);
        return true;
      }

      const tags_lower = state.items.map((item) => item.tag.toLowerCase());
      const query_lower = state.query.toLowerCase();
      const prefix = longest_common_prefix(tags_lower);

      if (prefix.length > query_lower.length) {
        const completion = (state.items[0]?.tag ?? "").slice(0, prefix.length);
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
    },
  });
}

export function set_tag_suggestions(
  view: EditorView,
  items: Array<{ tag: string; count: number }>,
) {
  view.dispatch(view.state.tr.setMeta(tag_suggest_plugin_key, { items }));
}
