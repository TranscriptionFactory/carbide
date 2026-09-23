import { Plugin, PluginKey } from "prosemirror-state";
import type { Transaction, EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";

type HeadingRange = {
  heading_pos: number;
  heading_end: number;
  body_start: number;
  body_end: number;
  level: number;
};

type HeadingFoldState = {
  folded: Set<number>;
  decorations: DecorationSet;
  toggles: number[];
};

type FoldMeta =
  | { action: "toggle"; pos: number }
  | { action: "collapse_all" }
  | { action: "expand_all" }
  | { action: "restore"; folded: Set<number> };

export const heading_fold_plugin_key = new PluginKey<HeadingFoldState>(
  "heading_fold",
);

export function compute_heading_ranges(doc: ProseNode): HeadingRange[] {
  const headings: { pos: number; end: number; level: number }[] = [];

  doc.forEach((node, offset) => {
    if (node.type.name === "heading" && node.attrs.level) {
      headings.push({
        pos: offset,
        end: offset + node.nodeSize,
        level: node.attrs.level as number,
      });
    }
  });

  const ranges: HeadingRange[] = [];

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    if (!h) continue;
    const body_start = h.end;

    let body_end = doc.content.size;
    for (let j = i + 1; j < headings.length; j++) {
      const next = headings[j];
      if (next && next.level <= h.level) {
        body_end = next.pos;
        break;
      }
    }

    if (body_start < body_end) {
      ranges.push({
        heading_pos: h.pos,
        heading_end: h.end,
        body_start,
        body_end,
        level: h.level,
      });
    }
  }

  return ranges;
}

function build_state(
  doc: ProseNode,
  folded: Set<number>,
  ranges: HeadingRange[] = compute_heading_ranges(doc),
): HeadingFoldState {
  return {
    folded,
    decorations: build_decorations(doc, folded, ranges),
    toggles: ranges.map((r) => r.heading_pos),
  };
}

function positions_equal(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Without folds the decorations are one toggle per foldable heading, so an
// edit that leaves that set of headings intact only needs them mapped.
function apply_doc_change(
  prev: HeadingFoldState,
  tr: Transaction,
  doc: ProseNode,
): HeadingFoldState {
  const folded = map_folded_set(prev.folded, tr);
  const ranges = compute_heading_ranges(doc);
  const toggles = ranges.map((r) => r.heading_pos);
  const mapped = prev.toggles.map((pos) => tr.mapping.map(pos, 1));
  if (folded.size === 0 && positions_equal(mapped, toggles)) {
    return {
      folded,
      decorations: prev.decorations.map(tr.mapping, doc),
      toggles,
    };
  }
  return build_state(doc, folded, ranges);
}

function build_decorations(
  doc: ProseNode,
  folded: Set<number>,
  heading_ranges: HeadingRange[],
): DecorationSet {
  if (heading_ranges.length === 0) return DecorationSet.empty;

  const decos: Decoration[] = [];

  // Linear scan: track the deepest active fold boundary to suppress
  // nested fold widgets (parent fold already hides them via decoration).
  let hide_until = -1;

  for (const range of heading_ranges) {
    const is_nested_inside_fold = range.heading_pos < hide_until;
    const is_folded = folded.has(range.heading_pos);

    if (!is_nested_inside_fold) {
      const toggle = document.createElement("span");
      toggle.className = `heading-fold-toggle${is_folded ? " heading-fold-toggle--folded" : ""}`;
      toggle.contentEditable = "false";

      decos.push(
        Decoration.widget(range.heading_pos + 1, toggle, { side: -1 }),
      );
    }

    if (is_nested_inside_fold || !is_folded) continue;

    if (range.body_end > hide_until) {
      hide_until = range.body_end;
    }

    const widget = document.createElement("span");
    widget.className = "heading-fold-indicator";
    widget.textContent = "…";
    widget.setAttribute("aria-label", "Folded content");

    decos.push(Decoration.widget(range.heading_end - 1, widget, { side: 1 }));

    doc.nodesBetween(range.body_start, range.body_end, (node, pos) => {
      if (pos >= range.body_start && pos < range.body_end) {
        const node_end = pos + node.nodeSize;
        if (node_end <= range.body_end) {
          decos.push(
            Decoration.node(pos, node_end, {
              class: "heading-fold-hidden",
              style: "display: none;",
            }),
          );
          return false;
        }
      }
      return true;
    });
  }

  return DecorationSet.create(doc, decos);
}

function map_folded_set(folded: Set<number>, tr: Transaction): Set<number> {
  if (!tr.docChanged || folded.size === 0) return folded;

  const next = new Set<number>();
  for (const pos of folded) {
    const r = tr.mapping.mapResult(pos, 1);
    if (r.deleted) continue;
    const node = tr.doc.nodeAt(r.pos);
    if (node?.type.name === "heading") next.add(r.pos);
  }
  return next;
}

export function create_heading_fold_prose_plugin(): Plugin<HeadingFoldState> {
  return new Plugin<HeadingFoldState>({
    key: heading_fold_plugin_key,

    state: {
      init(_, state) {
        return build_state(state.doc, new Set<number>());
      },

      apply(tr, prev, _old_state, new_state) {
        const meta = tr.getMeta(heading_fold_plugin_key) as
          | FoldMeta
          | undefined;

        let folded = prev.folded;

        if (meta) {
          switch (meta.action) {
            case "toggle": {
              folded = new Set(folded);
              if (folded.has(meta.pos)) {
                folded.delete(meta.pos);
              } else {
                folded.add(meta.pos);
              }
              break;
            }
            case "collapse_all": {
              folded = new Set<number>();
              const ranges = compute_heading_ranges(new_state.doc);
              for (const r of ranges) {
                folded.add(r.heading_pos);
              }
              return build_state(new_state.doc, folded, ranges);
            }
            case "expand_all": {
              return build_state(new_state.doc, new Set<number>());
            }
            case "restore": {
              const valid = new Set<number>();
              const ranges = compute_heading_ranges(new_state.doc);
              const heading_positions = new Set(
                ranges.map((r) => r.heading_pos),
              );
              for (const pos of meta.folded) {
                if (heading_positions.has(pos)) valid.add(pos);
              }
              return build_state(new_state.doc, valid, ranges);
            }
          }
          return build_state(new_state.doc, folded);
        }
        if (!tr.docChanged) return prev;
        return apply_doc_change(prev, tr, new_state.doc);
      },
    },

    props: {
      decorations(state: EditorState) {
        return heading_fold_plugin_key.getState(state)?.decorations;
      },

      handleDOMEvents: {
        mousedown(view: EditorView, event: MouseEvent) {
          const target = (event.target as HTMLElement).closest(
            ".heading-fold-toggle",
          );
          if (!target) return false;
          event.preventDefault();
          event.stopPropagation();
          // The toggle sits just inside its heading; mapped decorations keep
          // the DOM, so the position is read from the view, not baked in.
          toggle_heading_fold(view, view.posAtDOM(target, 0) - 1);
          return true;
        },
      },
    },
  });
}

export function toggle_heading_fold(view: EditorView, pos?: number) {
  const target_pos = pos ?? find_heading_at_selection(view.state);
  if (target_pos === null) return false;

  const tr = view.state.tr.setMeta(heading_fold_plugin_key, {
    action: "toggle",
    pos: target_pos,
  } satisfies FoldMeta);
  view.dispatch(tr);
  return true;
}

export function collapse_all_headings(view: EditorView) {
  const tr = view.state.tr.setMeta(heading_fold_plugin_key, {
    action: "collapse_all",
  } satisfies FoldMeta);
  view.dispatch(tr);
}

export function expand_all_headings(view: EditorView) {
  const tr = view.state.tr.setMeta(heading_fold_plugin_key, {
    action: "expand_all",
  } satisfies FoldMeta);
  view.dispatch(tr);
}

export function restore_heading_folds(view: EditorView, folded: Set<number>) {
  if (folded.size === 0) return;
  const tr = view.state.tr.setMeta(heading_fold_plugin_key, {
    action: "restore",
    folded,
  } satisfies FoldMeta);
  view.dispatch(tr);
}

function find_heading_at_selection(state: EditorState): number | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === "heading") {
      return $from.before(depth);
    }
  }

  const ranges = compute_heading_ranges(state.doc);
  const pos = $from.pos;
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i];
    if (r && r.heading_pos <= pos) {
      return r.heading_pos;
    }
  }

  return null;
}
