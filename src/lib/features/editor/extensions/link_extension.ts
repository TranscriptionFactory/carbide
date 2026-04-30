import type { Plugin } from "prosemirror-state";
import { schema } from "../adapters/markdown_pipeline";
import { create_link_tooltip_prose_plugin } from "../adapters/link_tooltip_plugin";
import { create_markdown_link_input_rule_prose_plugin } from "../adapters/markdown_link_input_rule";
import type { EditorExtension, PluginContext } from "./types";

export function create_link_extension(ctx: PluginContext): EditorExtension {
  const plugins: Plugin[] = [];
  const link_mark_type = schema.marks["link"];

  if (link_mark_type) {
    if (ctx.native_link_hover_enabled !== false) {
      const on_hover = ctx.events.on_markdown_lsp_hover;
      const lsp_hover_options = on_hover
        ? {
            get_lsp_hover: async (
              line: number,
              character: number,
            ): Promise<string | null> => {
              const result = await on_hover(line, character);
              return result?.contents ?? null;
            },
            get_markdown: ctx.get_markdown,
          }
        : undefined;
      plugins.push(
        create_link_tooltip_prose_plugin(link_mark_type, lsp_hover_options),
      );
    }
    plugins.push(
      create_markdown_link_input_rule_prose_plugin({
        link_type: link_mark_type,
      }),
    );
  }

  return { plugins };
}
