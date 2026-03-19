import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { Node as ProseNode, NodeType } from "prosemirror-model";
import {
  collect_paragraph_text,
  is_full_scan_meta,
} from "./embed_plugin_utils";

const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "ogg", "flac"];
const VIDEO_EXTENSIONS = ["mp4", "webm", "ogv", "mkv"];
const ALL_EMBED_EXTENSIONS = ["pdf", ...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS];

const EXTENSION_PATTERN = ALL_EMBED_EXTENSIONS.join("|");
const FILE_EMBED_REGEX = new RegExp(
  `^!\\[\\[([^\\]\\n]+\\.(?:${EXTENSION_PATTERN}))(#[^\\]]*)?\\]\\]$`,
  "i",
);

export const file_embed_plugin_key = new PluginKey("file-embed-plugin");

export function detect_embed_type(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (AUDIO_EXTENSIONS.includes(ext)) return "audio";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  return "unknown";
}

export function parse_embed_fragment(fragment: string): {
  page: number | null;
  height: number | null;
} {
  if (!fragment) return { page: null, height: null };
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  return {
    page: params.has("page") ? Number(params.get("page")) : null,
    height: params.has("height") ? Number(params.get("height")) : null,
  };
}

function replace_paragraph_with_embed(
  state: EditorState,
  para_pos: number,
  para_size: number,
  src: string,
  fragment: string,
  embed_type: NodeType,
): Transaction {
  const tr = state.tr;
  const para_end = para_pos + para_size;
  const file_type = detect_embed_type(src);
  const parsed = parse_embed_fragment(fragment);

  const new_node = embed_type.create({
    src,
    file_type,
    page: parsed.page,
    height: parsed.height ?? 400,
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

export function create_file_embed_plugin(): Plugin {
  return new Plugin({
    key: file_embed_plugin_key,
    appendTransaction(transactions, _old_state, new_state) {
      const force_full_scan = is_full_scan_meta(
        file_embed_plugin_key,
        transactions,
      );

      if (!force_full_scan && !transactions.some((tr) => tr.docChanged)) {
        return null;
      }

      const embed_type = new_state.schema.nodes["file_embed"];
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
          const match = FILE_EMBED_REGEX.exec(text);
          if (!match || !match[1]) continue;

          const src = match[1];
          const fragment = match[2] ?? "";
          const file_type = detect_embed_type(src);
          const parsed = parse_embed_fragment(fragment);

          const new_node = embed_type.create({
            src,
            file_type,
            page: parsed.page,
            height: parsed.height ?? 400,
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

      const text = collect_paragraph_text(parent);
      if (!text) return null;

      const match = FILE_EMBED_REGEX.exec(text);
      if (!match || !match[1]) return null;

      return replace_paragraph_with_embed(
        new_state,
        $from.before(),
        parent.nodeSize,
        match[1],
        match[2] ?? "",
        embed_type,
      );
    },
  });
}
