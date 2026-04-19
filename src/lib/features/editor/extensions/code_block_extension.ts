import type { Plugin } from "prosemirror-state";
import {
  create_code_block_view_prose_plugin,
  type CodeBlockViewCallbacks,
} from "../adapters/code_block_view_plugin";
import { create_shiki_prose_plugin } from "../adapters/shiki_plugin";
import { create_code_fence_language_prose_plugin } from "../adapters/code_fence_language_plugin";
import { schema } from "../adapters/schema";
import type { EditorExtension, PluginContext } from "./types";

export function create_code_block_extension(
  ctx: PluginContext,
): EditorExtension {
  const callbacks: CodeBlockViewCallbacks = {
    on_convert_mermaid_to_excalidraw: ctx.events.on_mermaid_to_excalidraw
      ? (code, view, pos) => {
          void (async () => {
            const file_path = await ctx.events.on_mermaid_to_excalidraw!(code);
            if (!file_path) return;
            const node = view.state.doc.nodeAt(pos);
            if (node) {
              const embed = schema.nodes.excalidraw_embed.create({
                src: file_path,
              });
              const insert_pos = pos + node.nodeSize;
              view.dispatch(view.state.tr.insert(insert_pos, embed));
            }
            ctx.events.on_internal_link_click?.(
              file_path,
              ctx.get_note_path(),
              "wiki",
            );
          })();
        }
      : undefined,
  };

  const plugins: Plugin[] = [
    create_code_fence_language_prose_plugin(),
    create_code_block_view_prose_plugin(callbacks),
    create_shiki_prose_plugin(),
  ];

  return { plugins };
}
