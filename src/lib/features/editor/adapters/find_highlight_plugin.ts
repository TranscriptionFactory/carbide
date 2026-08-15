import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import {
  DEFAULT_FIND_OPTIONS,
  type FindMatchRange,
  type FindMatchesListener,
  type FindOptions,
} from "$lib/features/editor/domain/find_types";
import { find_literal_matches_in_doc } from "$lib/features/editor/domain/find_literal_matcher";
import { normalize_active_index } from "$lib/features/editor/domain/find_active_index";

type FindHighlightMeta = {
  query: string;
  selected_index: number;
  options?: FindOptions;
  on_matches_change?: FindMatchesListener;
};

type MatchPosition = FindMatchRange;

type FindHighlightState = {
  decorations: DecorationSet;
  query: string;
  selected_index: number;
  options: FindOptions;
  match_positions: MatchPosition[];
  on_matches_change: FindMatchesListener | null;
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
          on_matches_change: null,
        };
      },
      apply(tr, plugin_state, _old_state, new_state) {
        const meta = tr.getMeta(find_highlight_plugin_key) as unknown;

        if (is_find_highlight_meta(meta)) {
          const { query, selected_index } = meta;
          const options = meta.options ?? plugin_state.options;
          const on_matches_change =
            meta.on_matches_change ?? plugin_state.on_matches_change;

          if (!query) {
            return {
              decorations: DecorationSet.empty,
              query: "",
              selected_index: 0,
              options,
              match_positions: [],
              on_matches_change,
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
            on_matches_change,
          };
        }

        if (!plugin_state.query) return plugin_state;

        if (tr.docChanged) {
          const match_positions = find_literal_matches_in_doc(
            new_state.doc,
            plugin_state.query,
            plugin_state.options,
          );
          const selected_index = normalize_active_index(
            plugin_state.selected_index,
            match_positions.length,
          );
          const decorations = build_decorations(
            new_state.doc,
            match_positions,
            selected_index,
          );

          return {
            ...plugin_state,
            decorations,
            match_positions,
            selected_index,
          };
        }

        return plugin_state;
      },
    },
    view() {
      return {
        update(view, prev_state) {
          const next = find_highlight_plugin_key.getState(view.state);
          if (!next?.on_matches_change) return;

          const prev = find_highlight_plugin_key.getState(prev_state);
          if (
            prev &&
            prev.match_positions.length === next.match_positions.length &&
            prev.selected_index === next.selected_index
          ) {
            return;
          }

          next.on_matches_change({
            match_count: next.match_positions.length,
            selected_index: next.selected_index,
          });
        },
      };
    },
    props: {
      decorations(state) {
        return this.getState(state)?.decorations;
      },
    },
  });
}
