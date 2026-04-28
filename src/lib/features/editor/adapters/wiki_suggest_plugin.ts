import { PluginKey, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  create_suggest_prose_plugin,
  type SuggestState,
} from "./suggest_plugin_factory";
import { format_wiki_display } from "$lib/features/editor/domain/wiki_link";
import { parent_folder_path } from "$lib/shared/utils/path";
import { longest_common_prefix } from "$lib/shared/utils/longest_common_prefix";

export const wiki_suggest_plugin_key = new PluginKey<
  SuggestState<SuggestionItem>
>("wiki-suggest");

type NoteSuggestionItem = {
  kind: "existing" | "planned";
  title: string;
  path: string;
  ref_count?: number | undefined;
};

type HeadingSuggestionItem = {
  kind: "heading";
  text: string;
  level: number;
};

type BlockSuggestionItem = {
  kind: "block";
  block_id: string;
  text: string;
};

type SuggestionItem =
  | NoteSuggestionItem
  | HeadingSuggestionItem
  | BlockSuggestionItem;

import type { WikiQueryEvent } from "$lib/features/editor/ports";

export type WikiSuggestPluginConfig = {
  on_query: (event: WikiQueryEvent) => void;
  on_dismiss: () => void;
  base_note_path: string;
};

export function describe_suggestion_location(path: string): string {
  return parent_folder_path(path) || "Vault root";
}

type ExtractedQuery =
  | { mode: "note"; query: string; offset: number; is_embed: boolean }
  | {
      mode: "heading";
      query: string;
      offset: number;
      is_embed: boolean;
      note_name: string | null;
      heading_query: string;
    }
  | {
      mode: "block";
      query: string;
      offset: number;
      is_embed: boolean;
      note_name: string | null;
      block_query: string;
    };

export function extract_wiki_query(text_before: string): ExtractedQuery | null {
  const open_idx = text_before.lastIndexOf("[[");
  if (open_idx === -1) return null;
  const after_open = text_before.slice(open_idx + 2);
  if (after_open.includes("]]") || after_open.includes("\n")) return null;
  if (after_open.includes("|")) return null;

  const is_embed = open_idx > 0 && text_before[open_idx - 1] === "!";
  const effective_offset = is_embed ? open_idx - 1 : open_idx;

  const hash_idx = after_open.indexOf("#");
  if (hash_idx !== -1) {
    const note_name = after_open.slice(0, hash_idx);
    const after_hash = after_open.slice(hash_idx + 1);
    if (after_hash.startsWith("^")) {
      const block_query = after_hash.slice(1);
      return {
        mode: "block",
        query: after_open,
        offset: effective_offset,
        is_embed,
        note_name: note_name.length > 0 ? note_name : null,
        block_query,
      };
    }
    const heading_query = after_hash;
    return {
      mode: "heading",
      query: after_open,
      offset: effective_offset,
      is_embed,
      note_name: note_name.length > 0 ? note_name : null,
      heading_query,
    };
  }

  return { mode: "note", query: after_open, offset: effective_offset, is_embed };
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
    row.className = "WikiSuggest__item";
    if (i === selected_index) row.classList.add("WikiSuggest__item--selected");

    if (item.kind === "heading") {
      row.classList.add("WikiSuggest__item--heading");

      const content = document.createElement("span");
      content.className = "WikiSuggest__content";
      const label = document.createElement("span");
      label.className = "WikiSuggest__label";
      label.textContent = item.text;
      content.appendChild(label);
      row.appendChild(content);

      const badge = document.createElement("span");
      badge.className = "WikiSuggest__badge WikiSuggest__level";
      badge.textContent = `H${String(item.level)}`;
      row.appendChild(badge);
    } else if (item.kind === "block") {
      row.classList.add("WikiSuggest__item--block");

      const content = document.createElement("span");
      content.className = "WikiSuggest__content";
      const label = document.createElement("span");
      label.className = "WikiSuggest__label";
      label.textContent = item.text;
      content.appendChild(label);
      row.appendChild(content);

      const badge = document.createElement("span");
      badge.className = "WikiSuggest__badge";
      badge.textContent = `^${item.block_id}`;
      row.appendChild(badge);
    } else {
      if (item.kind === "planned") {
        row.classList.add("WikiSuggest__item--planned");
      }

      const label = document.createElement("span");
      const meta = document.createElement("span");
      const location = document.createElement("span");
      const content = document.createElement("span");
      content.className = "WikiSuggest__content";

      label.className = "WikiSuggest__label";
      label.textContent = item.title;
      meta.className = "WikiSuggest__meta";
      location.className = "WikiSuggest__location";
      location.textContent = describe_suggestion_location(item.path);
      meta.appendChild(location);
      content.appendChild(label);
      content.appendChild(meta);
      row.appendChild(content);

      if (item.kind === "planned") {
        const refs = document.createElement("span");
        refs.className = "WikiSuggest__badge";
        refs.textContent = `${String(item.ref_count ?? 0)} refs`;
        row.appendChild(refs);
      }
    }

    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      on_select(i);
    });
    dropdown.appendChild(row);
  }
}

let current_mode: "note" | "heading" | "block" = "note";
let current_note_name: string | null = null;
let current_is_embed = false;

export function create_wiki_suggest_prose_plugin(
  config: WikiSuggestPluginConfig,
) {
  return create_suggest_prose_plugin<SuggestionItem>({
    key: wiki_suggest_plugin_key,
    class_name: "WikiSuggest",
    extract(text_before) {
      const result = extract_wiki_query(text_before);
      if (!result) return null;
      current_mode = result.mode;
      current_is_embed = result.is_embed;
      current_note_name =
        result.mode === "heading" || result.mode === "block"
          ? result.note_name
          : null;
      return {
        query: result.query,
        from_offset: result.offset,
        dismiss_key: result.mode + ":" + result.query,
      };
    },
    render_items,
    accept(view, item, state) {
      const prefix = current_is_embed ? "!" : "";
      let inner: string;
      if (item.kind === "heading") {
        const note_prefix = current_note_name ?? "";
        inner = note_prefix
          ? `${note_prefix}#${item.text}`
          : `#${item.text}`;
      } else if (item.kind === "block") {
        const note_prefix = current_note_name ?? "";
        inner = note_prefix
          ? `${note_prefix}#^${item.block_id}`
          : `#^${item.block_id}`;
      } else {
        inner = format_wiki_display(item.path);
      }
      const replacement = `${prefix}[[${inner}]]`;

      const selection_from = view.state.selection.from;
      const replace_to = Math.min(
        selection_from + 2,
        view.state.doc.content.size,
      );
      const tr = view.state.tr.replaceWith(
        state.from,
        replace_to,
        view.state.schema.text(replacement),
      );
      tr.setSelection(
        TextSelection.create(tr.doc, state.from + replacement.length),
      );
      tr.setMeta(wiki_suggest_plugin_key, {
        active: false,
        query: "",
        from: 0,
        items: [],
        selected_index: 0,
      });
      view.dispatch(tr);
      view.focus();
    },
    on_query(query) {
      const text_before_fake = "[[" + query;
      const result = extract_wiki_query(text_before_fake);
      if (!result) return;
      if (result.mode === "heading") {
        config.on_query({
          kind: "heading",
          note_name: result.note_name,
          heading_query: result.heading_query,
        });
      } else if (result.mode === "block") {
        config.on_query({
          kind: "block",
          note_name: result.note_name,
          block_query: result.block_query,
        });
      } else {
        config.on_query({ kind: "note", query: result.query });
      }
    },
    on_dismiss: config.on_dismiss,
    query_changed(prev, result) {
      const new_mode = current_mode;
      const old_mode_key = prev.query
        ? prev.query.includes("#^")
          ? "block"
          : prev.query.includes("#")
            ? "heading"
            : "note"
        : "note";
      return (
        result.query !== prev.query || new_mode !== old_mode_key || !prev.active
      );
    },
    handle_tab(view, state, accept_fn) {
      if (current_mode === "heading" || current_mode === "block") {
        if (state.items.length >= 1) {
          accept_fn(view, state.selected_index);
        }
        return true;
      }

      if (state.items.length === 1) {
        accept_fn(view, 0);
        return true;
      }

      const note_items = state.items.filter(
        (item): item is NoteSuggestionItem => item.kind !== "heading",
      );
      const paths = note_items.map((item) =>
        format_wiki_display(item.path).toLowerCase(),
      );
      const query_lower = state.query.toLowerCase();
      const prefix = longest_common_prefix(paths);

      if (prefix.length > query_lower.length) {
        const completion = format_wiki_display(note_items[0]?.path ?? "").slice(
          0,
          prefix.length,
        );
        const insert_from = state.from + 2;
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

export function set_wiki_suggestions(
  view: EditorView,
  items: Array<{
    title: string;
    path: string;
    kind: "existing" | "planned";
    ref_count?: number | undefined;
  }>,
) {
  view.dispatch(view.state.tr.setMeta(wiki_suggest_plugin_key, { items }));
}

export function set_heading_suggestions(
  view: EditorView,
  items: Array<{ text: string; level: number }>,
) {
  const mapped: HeadingSuggestionItem[] = items.map((h) => ({
    kind: "heading" as const,
    text: h.text,
    level: h.level,
  }));
  view.dispatch(
    view.state.tr.setMeta(wiki_suggest_plugin_key, { items: mapped }),
  );
}

export function set_block_suggestions(
  view: EditorView,
  items: Array<{ block_id: string; text: string }>,
) {
  const mapped: BlockSuggestionItem[] = items.map((b) => ({
    kind: "block" as const,
    block_id: b.block_id,
    text: b.text,
  }));
  view.dispatch(
    view.state.tr.setMeta(wiki_suggest_plugin_key, { items: mapped }),
  );
}
