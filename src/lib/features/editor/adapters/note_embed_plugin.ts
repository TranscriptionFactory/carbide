import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { Node as ProseNode, NodeType } from "prosemirror-model";
import {
  collect_paragraph_text,
  is_full_scan_meta,
} from "./embed_plugin_utils";
const NOTE_EMBED_REGEX = /^!\[\[([^\]#\n]+?)(?:#([^\]]*))?\]\]$/;

const FILE_EXTENSION_REGEX = /\.[a-zA-Z0-9]+$/;
const MD_EXTENSION_REGEX = /\.md$/i;

export const note_embed_plugin_key = new PluginKey("note-embed-plugin");

function is_note_target(target: string): boolean {
  if (MD_EXTENSION_REGEX.test(target)) return true;
  if (!FILE_EXTENSION_REGEX.test(target)) return true;
  return false;
}

function replace_paragraph_with_note_embed(
  state: EditorState,
  para_pos: number,
  para_size: number,
  target: string,
  fragment: string | null,
  embed_type: NodeType,
): Transaction {
  const tr = state.tr;
  const para_end = para_pos + para_size;

  const display_src = fragment ? `${target}#${fragment}` : target;
  const src = MD_EXTENSION_REGEX.test(target) ? target : `${target}.md`;

  const new_node = embed_type.create({
    src,
    fragment,
    display_src,
  });

  tr.replaceWith(para_pos, para_end, new_node);

  const after_pos = para_pos + new_node.nodeSize;
  const paragraph_type = state.schema.nodes.paragraph;
  if (after_pos >= tr.doc.content.size && paragraph_type) {
    tr.insert(after_pos, paragraph_type.create());
  }

  tr.setSelection(TextSelection.near(tr.doc.resolve(after_pos), 1));
  return tr;
}

function try_convert_paragraph(
  node: ProseNode,
): { target: string; fragment: string | null } | null {
  const text = collect_paragraph_text(node);
  if (!text) return null;

  const match = NOTE_EMBED_REGEX.exec(text);
  if (!match || !match[1]) return null;

  const target = match[1];
  if (!is_note_target(target)) return null;

  const fragment = match[2] ?? null;
  return { target, fragment };
}

export function create_note_embed_plugin(): Plugin {
  return new Plugin({
    key: note_embed_plugin_key,
    appendTransaction(transactions, _old_state, new_state) {
      const force_full_scan = is_full_scan_meta(
        note_embed_plugin_key,
        transactions,
      );

      if (!force_full_scan && !transactions.some((tr) => tr.docChanged)) {
        return null;
      }

      const embed_type = new_state.schema.nodes["note_embed"];
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
          const result = try_convert_paragraph(block.node);
          if (!result) continue;

          const display_src = result.fragment
            ? `${result.target}#${result.fragment}`
            : result.target;
          const src = MD_EXTENSION_REGEX.test(result.target)
            ? result.target
            : `${result.target}.md`;

          const new_node = embed_type.create({
            src,
            fragment: result.fragment,
            display_src,
          });
          tr.replaceWith(block.pos, block.pos + block.node.nodeSize, new_node);
        }

        if (!tr.docChanged) return null;
        tr.setMeta("addToHistory", false);
        return tr;
      }

      const { $from } = new_state.selection;
      const parent = $from.parent;
      if (parent.type.name !== "paragraph") return null;

      const result = try_convert_paragraph(parent);
      if (!result) return null;

      const text = collect_paragraph_text(parent);
      if (text) {
        const cursor_offset = $from.parentOffset;
        const close_idx = text.indexOf("]]");
        if (close_idx !== -1 && cursor_offset <= close_idx) return null;
      }

      return replace_paragraph_with_note_embed(
        new_state,
        $from.before(),
        parent.nodeSize,
        result.target,
        result.fragment,
        embed_type,
      );
    },
  });
}
