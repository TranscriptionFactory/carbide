import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { Node as ProseNode, Schema } from "prosemirror-model";
import {
  collect_paragraph_text,
  is_full_scan_meta,
  insert_leading_paragraph,
} from "./embed_plugin_utils";
import { parse_html_embed, type ParsedHtmlEmbed } from "./html_embed";

export const html_embed_plugin_key = new PluginKey("html-embed-plugin");

function build_embed_node(
  schema: Schema,
  parsed: ParsedHtmlEmbed,
): ProseNode | null {
  if (parsed.kind === "web_embed") {
    return (
      schema.nodes["web_embed"]?.create({
        src: parsed.src,
        title: parsed.title,
        width: parsed.width,
        height: parsed.height,
        align: parsed.align,
      }) ?? null
    );
  }
  return (
    schema.nodes["video"]?.create({
      src: parsed.src,
      poster: parsed.poster,
      width: parsed.width,
      height: parsed.height,
      controls: parsed.controls,
      autoplay: parsed.autoplay,
      loop: parsed.loop,
      muted: parsed.muted,
    }) ?? null
  );
}

function ensure_leading_paragraph(tr: Transaction, schema: Schema): void {
  const first_child = tr.doc.firstChild;
  const name = first_child?.type.name;
  if (name === "web_embed" || name === "video") {
    const paragraph_type = schema.nodes["paragraph"];
    if (paragraph_type) tr.insert(0, paragraph_type.create());
  }
}

export function create_html_embed_plugin(): Plugin {
  return new Plugin({
    key: html_embed_plugin_key,
    appendTransaction(transactions, _old_state, new_state) {
      const force_full_scan = is_full_scan_meta(
        html_embed_plugin_key,
        transactions,
      );

      if (!force_full_scan && !transactions.some((tr) => tr.docChanged)) {
        return null;
      }

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
          const parsed = parse_html_embed(text);
          if (!parsed) continue;
          const new_node = build_embed_node(new_state.schema, parsed);
          if (!new_node) continue;
          tr.replaceWith(block.pos, block.pos + block.node.nodeSize, new_node);
        }

        if (!tr.docChanged) return null;

        ensure_leading_paragraph(tr, new_state.schema);
        tr.setMeta("addToHistory", false);
        return tr;
      }

      const { $from } = new_state.selection;
      const parent = $from.parent;
      if (parent.type.name !== "paragraph") return null;

      const text = collect_paragraph_text(parent);
      if (!text) return null;

      const parsed = parse_html_embed(text);
      if (!parsed) return null;

      const new_node = build_embed_node(new_state.schema, parsed);
      if (!new_node) return null;

      return replace_paragraph_with_embed(
        new_state,
        $from.before(),
        parent.nodeSize,
        new_node,
      );
    },
  });
}

function replace_paragraph_with_embed(
  state: EditorState,
  para_pos: number,
  para_size: number,
  new_node: ProseNode,
): Transaction {
  const tr = state.tr;
  tr.replaceWith(para_pos, para_pos + para_size, new_node);
  const after_pos = insert_leading_paragraph(
    tr,
    state.schema,
    para_pos,
    new_node,
  );
  tr.setSelection(TextSelection.near(tr.doc.resolve(after_pos), 1));
  return tr;
}
