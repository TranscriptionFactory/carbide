import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { Node as ProseNode, NodeType } from "prosemirror-model";

const IMAGE_MARKDOWN_REGEX = /!\[([^\]]*)\]\(([^)\s]+)\)/;

interface PromotionCandidate {
  pos: number;
  size: number;
  src: string;
}

export function create_image_input_rule_prose_plugin(): Plugin {
  return new Plugin({
    key: new PluginKey("image-block-converter"),
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      const image_block_type = newState.schema.nodes["image-block"];
      if (!image_block_type) return null;

      const changed_ranges = collect_changed_ranges(transactions);
      if (changed_ranges.length === 0) return null;

      const from = Math.max(0, Math.min(...changed_ranges.map((r) => r.from)));
      const to = Math.min(
        newState.doc.content.size,
        Math.max(...changed_ranges.map((r) => r.to)),
      );

      const candidates: PromotionCandidate[] = [];
      newState.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name !== "paragraph") return;

        const inline_image = find_solo_inline_image(node);
        if (inline_image) {
          candidates.push({
            pos,
            size: node.nodeSize,
            src: String(inline_image.attrs.src),
          });
          return false;
        }

        const text_match = find_solo_image_text(node, node.content.size);
        if (text_match) {
          candidates.push({ pos, size: node.nodeSize, src: text_match.src });
          return false;
        }
      });

      if (candidates.length === 0) return null;

      const tr = newState.tr;
      for (let i = candidates.length - 1; i >= 0; i--) {
        const c = candidates[i]!;
        const mapped_pos = tr.mapping.map(c.pos);
        const mapped_end = tr.mapping.map(c.pos + c.size);
        const new_node = image_block_type.create({
          src: c.src,
          caption: "",
          ratio: 1,
        });
        tr.replaceWith(mapped_pos, mapped_end, new_node);
      }

      const last = candidates[candidates.length - 1]!;
      const after_pos = tr.mapping.map(last.pos) + 1;
      const paragraph_type = newState.schema.nodes.paragraph;
      if (after_pos >= tr.doc.content.size && paragraph_type) {
        tr.insert(tr.doc.content.size, paragraph_type.create());
      }

      const cursor_target = Math.min(after_pos, tr.doc.content.size);
      tr.setSelection(
        TextSelection.near(tr.doc.resolve(cursor_target), 1),
      );

      return tr;
    },
  });
}

function collect_changed_ranges(
  transactions: readonly Transaction[],
): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  for (const t of transactions) {
    t.steps.forEach((_step, i) => {
      const map = t.mapping.maps[i];
      if (map) {
        map.forEach((_oldFrom, _oldTo, from, to) => {
          ranges.push({ from, to });
        });
      }
    });
  }
  return ranges;
}

function find_solo_inline_image(parent: ProseNode): ProseNode | null {
  if (parent.childCount !== 1) return null;
  const child = parent.child(0);
  return child.type.name === "image" ? child : null;
}

function collect_text(parent: ProseNode): string | null {
  const result = { text: "", has_non_text: false };

  parent.descendants((node: ProseNode) => {
    if (node.isText && node.text) {
      result.text += node.text;
      return true;
    }
    if (node.isInline) {
      result.has_non_text = true;
      return false;
    }
    return true;
  });

  if (result.has_non_text || result.text.length === 0) return null;
  return result.text;
}

function find_solo_image_text(
  parent: ProseNode,
  anchor_offset: number,
): { src: string } | null {
  const combined = collect_text(parent);
  if (!combined) return null;

  const window_start = Math.max(0, anchor_offset - 256);
  const window_end = Math.min(combined.length, anchor_offset + 64);
  const window_text = combined.slice(window_start, window_end);

  const match = IMAGE_MARKDOWN_REGEX.exec(window_text);
  if (!match) return null;

  const [full_match, , src] = match;
  if (!src) return null;

  const match_start = window_start + match.index;
  const match_end = match_start + full_match.length;

  const has_text_before = combined.slice(0, match_start).trim() !== "";
  const has_text_after = combined.slice(match_end).trim() !== "";
  if (has_text_before || has_text_after) return null;

  return { src };
}
