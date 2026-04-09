import { Plugin, TextSelection } from "prosemirror-state";

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
  resolve: (pos: number) => unknown;
}): number {
  const first = doc.firstChild;
  if (first && first.type.name === "frontmatter") {
    return first.nodeSize + 1;
  }
  return 1;
}

export function create_frontmatter_guard_plugin(): Plugin {
  return new Plugin({
    appendTransaction(_transactions, _oldState, newState) {
      if (!is_inside_frontmatter(newState)) return null;

      const pos = first_body_position(newState.doc);
      const $pos = newState.doc.resolve(
        Math.min(pos, newState.doc.content.size),
      );
      return newState.tr.setSelection(TextSelection.near($pos));
    },
  });
}
