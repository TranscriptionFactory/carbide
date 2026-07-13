import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node } from "prosemirror-model";
import { format_hotkey_for_display } from "$lib/features/hotkey";

export const placeholder_plugin_key = new PluginKey("placeholder");

function placeholder_text(): string {
  const palette_key = format_hotkey_for_display("CmdOrCtrl+Shift+P");
  return `Type '/' for slash commands · '@' for the reference palette · ${palette_key} for the command palette`;
}

function is_empty_paragraph(node: Node): boolean {
  return node.type.name === "paragraph" && node.content.size === 0;
}

function find_placeholder_target(
  doc: Node,
): { pos: number; node: Node } | null {
  const first = doc.firstChild;
  if (!first) return null;
  if (doc.childCount === 1 && is_empty_paragraph(first)) {
    return { pos: 0, node: first };
  }
  const last = doc.lastChild;
  if (
    doc.childCount === 2 &&
    first.type.name === "frontmatter" &&
    last &&
    is_empty_paragraph(last)
  ) {
    return { pos: first.nodeSize, node: last };
  }
  return null;
}

export function create_placeholder_plugin(): Plugin {
  return new Plugin({
    key: placeholder_plugin_key,
    props: {
      decorations(state) {
        const target = find_placeholder_target(state.doc);
        if (!target) return null;
        return DecorationSet.create(state.doc, [
          Decoration.node(target.pos, target.pos + target.node.nodeSize, {
            class: "is-empty",
            "data-placeholder": placeholder_text(),
          }),
        ]);
      },
    },
  });
}
