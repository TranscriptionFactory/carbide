import { PluginKey, TextSelection } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  create_suggest_prose_plugin,
  type SuggestState,
} from "./suggest_plugin_factory";
import { schema } from "./schema";
import { to_markdown_asset_target } from "$lib/features/note";
import type { AssetPath, NotePath } from "$lib/shared/types/ids";

export const image_suggest_plugin_key = new PluginKey<
  SuggestState<SuggestionItem>
>("image-suggest");

const IMAGE_OPENER_REGEX = /!\[([^\]]*)\]\($/;

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

// The typed `![alt](query` plus an auto-paired `)` after the caret.
function image_markdown_range(
  state: EditorState,
  paren_pos: number,
): { from: number; to: number; alt: string } | null {
  const $paren = state.doc.resolve(paren_pos);
  const opener = IMAGE_OPENER_REGEX.exec(
    $paren.parent.textBetween(0, $paren.parentOffset),
  );
  if (!opener) return null;
  const caret = state.selection.from;
  const after = state.doc.textBetween(caret, Math.min(caret + 1, $paren.end()));
  return {
    from: paren_pos - opener[0].length,
    to: after === ")" ? caret + 1 : caret,
    alt: opener[1] ?? "",
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
      const range = image_markdown_range(view.state, state.from);
      if (!range) return;
      const image = schema.nodes.image.create({
        src: relative_path,
        alt: range.alt,
      });
      const tr = view.state.tr.replaceWith(range.from, range.to, image);
      tr.setSelection(
        TextSelection.create(tr.doc, range.from + image.nodeSize),
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
