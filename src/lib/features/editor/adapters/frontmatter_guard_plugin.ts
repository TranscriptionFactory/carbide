import { Plugin, TextSelection } from "prosemirror-state";
import type { Node as PmNode } from "prosemirror-model";

export const SKIP_FRONTMATTER_GUARD = "skip_frontmatter_guard";

function is_inside_frontmatter(state: {
  selection: {
    $from: {
      node: (depth: number) => { type: { name: string } };
      depth: number;
    };
  };
}): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d >= 0; d--) {
    if ($from.node(d).type.name === "frontmatter") return true;
  }
  return false;
}

function first_body_position(doc: {
  firstChild: { type: { name: string }; nodeSize: number } | null;
}): number {
  const first = doc.firstChild;
  if (first && first.type.name === "frontmatter") {
    return first.nodeSize + 1;
  }
  return 1;
}

function doc_has_frontmatter(doc: PmNode): boolean {
  return doc.firstChild?.type.name === "frontmatter";
}

export function create_frontmatter_guard_plugin(): Plugin {
  return new Plugin({
    filterTransaction(tr, state) {
      if (!doc_has_frontmatter(state.doc)) return true;
      if (doc_has_frontmatter(tr.doc)) return true;
      if (tr.getMeta("addToHistory") === false) return true;
      if (tr.getMeta(SKIP_FRONTMATTER_GUARD) === true) return true;
      return false;
    },

    appendTransaction(_transactions, _oldState, newState) {
      if (is_inside_frontmatter(newState)) {
        const pos = first_body_position(newState.doc);
        const $pos = newState.doc.resolve(
          Math.min(pos, newState.doc.content.size),
        );
        return newState.tr.setSelection(TextSelection.near($pos));
      }

      if (doc_has_frontmatter(newState.doc)) {
        const { from, to } = newState.selection;
        const body_start = first_body_position(newState.doc);
        if (from < body_start && to >= body_start) {
          const clipped_from = Math.min(body_start, newState.doc.content.size);
          const $from = newState.doc.resolve(clipped_from);
          const $to = newState.doc.resolve(to);
          return newState.tr.setSelection(TextSelection.between($from, $to));
        }
      }

      return null;
    },
  });
}
