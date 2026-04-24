import { PluginKey, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  create_suggest_prose_plugin,
  type SuggestState,
} from "./suggest_plugin_factory";
import { to_markdown_asset_target } from "$lib/features/note";
import type { AssetPath, NotePath } from "$lib/shared/types/ids";

export const image_suggest_plugin_key = new PluginKey<
  SuggestState<SuggestionItem>
>("image-suggest");

type SuggestionItem = {
  path: string;
  name: string;
};

export type ImageSuggestPluginConfig = {
  on_query: (query: string) => void;
  on_dismiss: () => void;
  base_note_path: string;
};

function extract_image_path_query(
  text_before: string,
): { query: string; paren_offset: number } | null {
  const regex = /!\[[^\]]*\]\(([^)\n]*)$/;
  const match = regex.exec(text_before);
  if (!match || match[1] === undefined) return null;
  return {
    query: match[1],
    paren_offset: match.index + match[0].length - match[1].length,
  };
}

function render_items(
  dropdown: HTMLElement,
  items: SuggestionItem[],
  selected_index: number,
  on_select: (index: number) => void,
) {
  dropdown.innerHTML = "";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "ImageSuggest__item";
    if (i === selected_index) row.classList.add("ImageSuggest__item--selected");

    const content = document.createElement("span");
    content.className = "ImageSuggest__content";

    const label = document.createElement("span");
    label.className = "ImageSuggest__label";
    label.textContent = item.name;

    const location = document.createElement("span");
    location.className = "ImageSuggest__location";
    const dir = item.path.includes("/")
      ? item.path.slice(0, item.path.lastIndexOf("/"))
      : "Vault root";
    location.textContent = dir;

    content.appendChild(label);
    content.appendChild(location);
    row.appendChild(content);

    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      on_select(i);
    });
    dropdown.appendChild(row);
  }
}

export function create_image_suggest_prose_plugin(
  config: ImageSuggestPluginConfig,
) {
  return create_suggest_prose_plugin<SuggestionItem>({
    key: image_suggest_plugin_key,
    class_name: "ImageSuggest",
    extract(text_before) {
      const result = extract_image_path_query(text_before);
      if (!result) return null;
      return { query: result.query, from_offset: result.paren_offset };
    },
    render_items,
    accept(view, item, state) {
      const relative_path = to_markdown_asset_target(
        config.base_note_path as NotePath,
        item.path as AssetPath,
      );
      const tr = view.state.tr.insertText(
        relative_path,
        state.from,
        view.state.selection.from,
      );
      tr.setSelection(
        TextSelection.create(tr.doc, state.from + relative_path.length),
      );
      tr.setMeta(image_suggest_plugin_key, {
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
      } else {
        const next = (state.selected_index + 1) % state.items.length;
        view.dispatch(
          view.state.tr.setMeta(image_suggest_plugin_key, {
            ...state,
            selected_index: next,
          }),
        );
      }
      return true;
    },
  });
}

export function set_image_suggestions(
  view: EditorView,
  items: Array<{ path: string; name: string }>,
) {
  view.dispatch(view.state.tr.setMeta(image_suggest_plugin_key, { items }));
}
