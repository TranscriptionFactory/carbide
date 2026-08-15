import { Plugin, PluginKey, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import {
  DEFAULT_FIND_OPTIONS,
  type FindMatchRange,
  type FindMatchesListener,
  type FindOptions,
  type FindRange,
} from "$lib/features/editor/domain/find_types";
import { find_literal_matches_in_doc } from "$lib/features/editor/domain/find_literal_matcher";
import { normalize_active_index } from "$lib/features/editor/domain/find_active_index";
import { map_find_options } from "$lib/features/editor/domain/find_scope";

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

function resolve_options(options: FindOptions, tr: Transaction): FindOptions {
  return tr.docChanged ? map_find_options(options, tr.mapping) : options;
}

function ranges_equal(a: FindRange | undefined, b: FindRange | undefined) {
  if (!a || !b) return a === b;
  return a.from === b.from && a.to === b.to;
}

function find_state_changed(
  prev: FindHighlightState,
  next: FindHighlightState,
): boolean {
  return (
    prev.match_positions.length !== next.match_positions.length ||
    prev.selected_index !== next.selected_index ||
    !ranges_equal(prev.options.range, next.options.range)
  );
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
          const options = resolve_options(
            meta.options ?? plugin_state.options,
            tr,
          );
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
          const options = resolve_options(plugin_state.options, tr);
          const match_positions = find_literal_matches_in_doc(
            new_state.doc,
            plugin_state.query,
            options,
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
            options,
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
          if (prev && !find_state_changed(prev, next)) return;

          next.on_matches_change({
            match_count: next.match_positions.length,
            selected_index: next.selected_index,
            range: next.options.range ?? null,
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
