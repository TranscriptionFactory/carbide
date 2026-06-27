import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import {
  DEFAULT_FIND_OPTIONS,
  type FindMatchRange,
  type FindOptions,
} from "$lib/features/editor/domain/find_types";
import { find_literal_matches_in_doc } from "$lib/features/editor/domain/find_literal_matcher";

type FindHighlightMeta = {
  query: string;
  selected_index: number;
  options?: FindOptions;
};

type MatchPosition = FindMatchRange;

type FindHighlightState = {
  decorations: DecorationSet;
  query: string;
  selected_index: number;
  options: FindOptions;
  match_positions: MatchPosition[];
};

function is_find_highlight_meta(value: unknown): value is FindHighlightMeta {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.query === "string" && typeof obj.selected_index === "number"
  );
}

function build_decorations(
  doc: ProseNode,
  match_positions: MatchPosition[],
  selected_index: number,
): DecorationSet {
  if (match_positions.length === 0) return DecorationSet.empty;

  const decorations = match_positions.map((pos, i) =>
    Decoration.inline(pos.from, pos.to, {
      class:
        i === selected_index ? "find-match find-match--selected" : "find-match",
    }),
  );

  return DecorationSet.create(doc, decorations);
}

export const find_highlight_plugin_key = new PluginKey<FindHighlightState>(
  "find-highlight",
);

export function create_find_highlight_prose_plugin(): Plugin<FindHighlightState> {
  return new Plugin<FindHighlightState>({
    key: find_highlight_plugin_key,
    state: {
      init() {
        return {
          decorations: DecorationSet.empty,
          query: "",
          selected_index: 0,
          options: DEFAULT_FIND_OPTIONS,
          match_positions: [],
        };
      },
      apply(tr, plugin_state, _old_state, new_state) {
        const meta = tr.getMeta(find_highlight_plugin_key) as unknown;

        if (is_find_highlight_meta(meta)) {
          const { query, selected_index } = meta;
          const options = meta.options ?? plugin_state.options;

          if (!query) {
            return {
              decorations: DecorationSet.empty,
              query: "",
              selected_index: 0,
              options,
              match_positions: [],
            };
          }

          const match_positions = find_literal_matches_in_doc(
            new_state.doc,
            query,
            options,
          );
          const decorations = build_decorations(
            new_state.doc,
            match_positions,
            selected_index,
          );

          return {
            decorations,
            query,
            selected_index,
            options,
            match_positions,
          };
        }

        if (!plugin_state.query) return plugin_state;

        if (tr.docChanged) {
          const match_positions = find_literal_matches_in_doc(
            new_state.doc,
            plugin_state.query,
            plugin_state.options,
          );
          const decorations = build_decorations(
            new_state.doc,
            match_positions,
            plugin_state.selected_index,
          );

          return { ...plugin_state, decorations, match_positions };
        }

        return plugin_state;
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)?.decorations;
      },
    },
  });
}
