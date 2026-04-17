import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";

type BlockSelectionState = {
  selected_positions: Set<number>;
  anchor_pos: number | null;
};

export type BlockSelectionMeta =
  | { action: "toggle"; pos: number }
  | { action: "extend"; pos: number }
  | { action: "clear" }
  | { action: "set"; positions: number[] };

export const block_selection_plugin_key = new PluginKey<BlockSelectionState>(
  "block-selection",
);

function resolve_top_level_pos(
  doc: EditorState["doc"],
  pos: number,
): number | null {
  const $pos = doc.resolve(pos);
  if ($pos.depth < 1) return null;
  return $pos.start(1) - 1;
}

function get_top_level_positions(doc: EditorState["doc"]): number[] {
  const positions: number[] = [];
  doc.forEach((_node, offset) => {
    positions.push(offset);
  });
  return positions;
}

function apply_meta(
  prev: BlockSelectionState,
  meta: BlockSelectionMeta,
  doc: EditorState["doc"],
): BlockSelectionState {
  switch (meta.action) {
    case "toggle": {
      const next = new Set(prev.selected_positions);
      if (next.has(meta.pos)) {
        next.delete(meta.pos);
      } else {
        next.add(meta.pos);
      }
      return {
        selected_positions: next,
        anchor_pos: next.size > 0 ? (prev.anchor_pos ?? meta.pos) : null,
      };
    }
    case "extend": {
      const anchor = prev.anchor_pos;
      if (anchor == null) {
        const next = new Set<number>();
        next.add(meta.pos);
        return { selected_positions: next, anchor_pos: meta.pos };
      }
      const all_positions = get_top_level_positions(doc);
      const anchor_idx = all_positions.indexOf(anchor);
      const target_idx = all_positions.indexOf(meta.pos);
      if (anchor_idx === -1 || target_idx === -1) return prev;
      const start = Math.min(anchor_idx, target_idx);
      const end = Math.max(anchor_idx, target_idx);
      const next = new Set<number>();
      for (let i = start; i <= end; i++) {
        next.add(all_positions[i]!);
      }
      return { selected_positions: next, anchor_pos: anchor };
    }
    case "clear":
      return { selected_positions: new Set(), anchor_pos: null };
    case "set": {
      const next = new Set(meta.positions);
      return {
        selected_positions: next,
        anchor_pos: meta.positions[0] ?? null,
      };
    }
  }
}

function remap_positions(
  prev: Set<number>,
  tr: Transaction,
  doc: EditorState["doc"],
): Set<number> {
  const next = new Set<number>();
  for (const pos of prev) {
    const mapped = tr.mapping.map(pos, 1);
    if (mapped >= 0 && mapped < doc.content.size) {
      const node = doc.nodeAt(mapped);
      if (node && node.isBlock) {
        next.add(mapped);
      }
    }
  }
  return next;
}

function build_decorations(
  state: BlockSelectionState,
  doc: EditorState["doc"],
): DecorationSet {
  const decorations: Decoration[] = [];
  for (const pos of state.selected_positions) {
    const node = doc.nodeAt(pos);
    if (node) {
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, { class: "block-selected" }),
      );
    }
  }
  return DecorationSet.create(doc, decorations);
}

export function get_block_selection(state: EditorState): Set<number> {
  const plugin_state = block_selection_plugin_key.getState(state);
  return plugin_state?.selected_positions ?? new Set();
}

export function clear_block_selection(view: EditorView): void {
  const tr = view.state.tr.setMeta(block_selection_plugin_key, {
    action: "clear",
  } satisfies BlockSelectionMeta);
  view.dispatch(tr);
}

export function create_block_selection_plugin(): Plugin {
  return new Plugin<BlockSelectionState>({
    key: block_selection_plugin_key,

    state: {
      init() {
        return { selected_positions: new Set(), anchor_pos: null };
      },
      apply(tr, prev, _old_state, new_state) {
        const meta = tr.getMeta(block_selection_plugin_key) as
          | BlockSelectionMeta
          | undefined;
        if (meta) {
          return apply_meta(prev, meta, new_state.doc);
        }
        if (tr.docChanged) {
          const remapped = remap_positions(
            prev.selected_positions,
            tr,
            new_state.doc,
          );
          if (remapped.size !== prev.selected_positions.size) {
            return {
              selected_positions: remapped,
              anchor_pos:
                prev.anchor_pos != null && remapped.size > 0
                  ? tr.mapping.map(prev.anchor_pos, 1)
                  : null,
            };
          }
          return {
            selected_positions: remapped,
            anchor_pos:
              prev.anchor_pos != null
                ? tr.mapping.map(prev.anchor_pos, 1)
                : null,
          };
        }
        return prev;
      },
    },

    props: {
      decorations(state) {
        const plugin_state = block_selection_plugin_key.getState(state);
        if (!plugin_state || plugin_state.selected_positions.size === 0) {
          return DecorationSet.empty;
        }
        return build_decorations(plugin_state, state.doc);
      },

      handleKeyDown(view, event) {
        const plugin_state = block_selection_plugin_key.getState(view.state);

        if (
          event.key === "Escape" &&
          plugin_state &&
          plugin_state.selected_positions.size > 0
        ) {
          clear_block_selection(view);
          return true;
        }

        if (
          event.shiftKey &&
          (event.key === "ArrowDown" || event.key === "ArrowUp")
        ) {
          const { $from } = view.state.selection;
          const current_pos = resolve_top_level_pos(view.state.doc, $from.pos);
          if (current_pos == null) return false;

          const all_positions = get_top_level_positions(view.state.doc);
          const current_idx = all_positions.indexOf(current_pos);
          if (current_idx === -1) return false;

          const target_idx =
            event.key === "ArrowDown"
              ? Math.min(current_idx + 1, all_positions.length - 1)
              : Math.max(current_idx - 1, 0);

          if (target_idx === current_idx) return false;

          const anchor =
            plugin_state && plugin_state.selected_positions.size > 0
              ? (plugin_state.anchor_pos ?? current_pos)
              : current_pos;

          const tr = view.state.tr.setMeta(block_selection_plugin_key, {
            action: "extend",
            pos: all_positions[target_idx]!,
          } satisfies BlockSelectionMeta);

          if (plugin_state && plugin_state.anchor_pos == null) {
            tr.setMeta(block_selection_plugin_key, {
              action: "set",
              positions: (() => {
                const start = Math.min(current_idx, target_idx);
                const end = Math.max(current_idx, target_idx);
                return all_positions.slice(start, end + 1);
              })(),
            } satisfies BlockSelectionMeta);
          }

          view.dispatch(tr);
          return true;
        }

        return false;
      },

      handleDOMEvents: {
        mousedown(view, event) {
          if (!event.shiftKey) return false;

          const coords = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          if (!coords) return false;

          const pos = resolve_top_level_pos(view.state.doc, coords.pos);
          if (pos == null) return false;

          const tr = view.state.tr.setMeta(block_selection_plugin_key, {
            action: "toggle",
            pos,
          } satisfies BlockSelectionMeta);
          view.dispatch(tr);
          event.preventDefault();
          return true;
        },
      },
    },
  });
}
