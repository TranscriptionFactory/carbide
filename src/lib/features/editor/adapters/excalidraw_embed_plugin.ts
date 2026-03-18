import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { Node as ProseNode, NodeType } from "prosemirror-model";

const EXCALIDRAW_EMBED_REGEX = /^!\[\[([^\]\n]+\.(?:excalidraw|canvas))\]\]$/;

export const excalidraw_embed_plugin_key = new PluginKey(
  "excalidraw-embed-plugin",
);

type EmbedMeta = { action: "full_scan" };

function is_full_scan_action(value: unknown): value is EmbedMeta {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj.action === "full_scan";
}

function collect_paragraph_text(node: ProseNode): string | null {
  let text = "";
  let has_non_text = false;

  node.descendants((child: ProseNode) => {
    if (child.isText && child.text) {
      text += child.text;
      return true;
    }
    if (child.isInline) {
      has_non_text = true;
      return false;
    }
    return true;
  });

  if (has_non_text || text.length === 0) return null;
  return text;
}

function replace_paragraph_with_embed(
  state: EditorState,
  para_pos: number,
  para_size: number,
  src: string,
  embed_type: NodeType,
): Transaction {
  const tr = state.tr;
  const para_end = para_pos + para_size;
  const new_node = embed_type.create({ src });

  tr.replaceWith(para_pos, para_end, new_node);

  const after_pos = para_pos + new_node.nodeSize;
  const paragraph_type = state.schema.nodes.paragraph;
  if (after_pos >= tr.doc.content.size && paragraph_type) {
    tr.insert(after_pos, paragraph_type.create());
  }

  tr.setSelection(TextSelection.near(tr.doc.resolve(after_pos), 1));
  return tr;
}

export function create_excalidraw_embed_plugin(): Plugin {
  return new Plugin({
    key: excalidraw_embed_plugin_key,
    appendTransaction(transactions, _old_state, new_state) {
      const force_full_scan = transactions.some((tr) =>
        is_full_scan_action(tr.getMeta(excalidraw_embed_plugin_key)),
      );

      if (!force_full_scan && !transactions.some((tr) => tr.docChanged)) {
        return null;
      }

      const embed_type = new_state.schema.nodes["excalidraw_embed"];
      if (!embed_type) return null;

      if (force_full_scan) {
        const tr = new_state.tr;
        const blocks: Array<{ node: ProseNode; pos: number }> = [];

        new_state.doc.descendants((node, pos) => {
          if (node.type.name === "paragraph") {
            blocks.push({ node, pos });
            return false;
          }
          return true;
        });

        for (let i = blocks.length - 1; i >= 0; i--) {
          const block = blocks[i];
          if (!block) continue;
          const text = collect_paragraph_text(block.node);
          if (!text) continue;
          const match = EXCALIDRAW_EMBED_REGEX.exec(text);
          if (!match || !match[1]) continue;

          const new_node = embed_type.create({ src: match[1] });
          tr.replaceWith(block.pos, block.pos + block.node.nodeSize, new_node);
        }

        if (!tr.docChanged) return null;
        tr.setMeta("addToHistory", false);
        return tr;
      }

      const { $from } = new_state.selection;
      const parent = $from.parent;
      if (parent.type.name !== "paragraph") return null;

      const text = collect_paragraph_text(parent);
      if (!text) return null;

      const match = EXCALIDRAW_EMBED_REGEX.exec(text);
      if (!match || !match[1]) return null;

      return replace_paragraph_with_embed(
        new_state,
        $from.before(),
        parent.nodeSize,
        match[1],
        embed_type,
      );
    },
  });
}
