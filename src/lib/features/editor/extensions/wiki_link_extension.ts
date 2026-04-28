import type { Plugin } from "prosemirror-state";
import { schema } from "../adapters/markdown_pipeline";
import {
  create_wiki_link_converter_prose_plugin,
  create_wiki_link_click_prose_plugin,
  wiki_link_plugin_key,
} from "../adapters/wiki_link_plugin";
import {
  set_wiki_suggestions,
  set_heading_suggestions,
  set_block_suggestions,
  create_wiki_suggest_prose_plugin,
  type WikiSuggestPluginConfig,
} from "../adapters/wiki_suggest_plugin";
import type { EditorExtension, PluginContext } from "./types";

export function create_wiki_link_extension(
  ctx: PluginContext,
): EditorExtension {
  const plugins: Plugin[] = [];
  let wiki_suggest_config: WikiSuggestPluginConfig | null = null;
  const link_mark_type = schema.marks["link"];

  if (link_mark_type) {
    plugins.push(
      create_wiki_link_converter_prose_plugin({
        link_type: link_mark_type,
      }),
    );
  }

  if (
    ctx.events.on_internal_link_click &&
    ctx.native_link_click_enabled !== false
  ) {
    plugins.push(
      create_wiki_link_click_prose_plugin({
        on_internal_link_click: ctx.events.on_internal_link_click,
        on_external_link_click: ctx.events.on_external_link_click ?? (() => {}),
        on_anchor_link_click: ctx.events.on_anchor_link_click,
      }),
    );
  }

  if (
    ctx.events.on_wiki_suggest_query &&
    ctx.native_wiki_suggest_enabled !== false
  ) {
    wiki_suggest_config = {
      on_query: ctx.events.on_wiki_suggest_query,
      on_dismiss: () => {},
      base_note_path: ctx.get_note_path(),
    };
    plugins.push(
      create_wiki_suggest_prose_plugin(wiki_suggest_config) as Plugin,
    );
  }

  return {
    plugins,
    on_note_path_change(path: string) {
      if (wiki_suggest_config) {
        wiki_suggest_config.base_note_path = path;
      }
    },
  };
}

export { wiki_link_plugin_key, set_wiki_suggestions, set_heading_suggestions, set_block_suggestions };
export type { WikiQueryEvent } from "$lib/features/editor/ports";
