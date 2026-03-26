import type { Plugin } from "prosemirror-state";
import { create_slash_command_prose_plugin } from "../adapters/slash_command_plugin";
import { create_date_suggest_prose_plugin } from "../adapters/date_suggest_plugin";
import {
  set_tag_suggestions,
  create_tag_suggest_prose_plugin,
  type TagSuggestPluginConfig,
} from "../adapters/tag_suggest_plugin";
import {
  set_cite_suggestions,
  create_cite_suggest_prose_plugin,
  type CiteSuggestPluginConfig,
} from "../adapters/cite_suggest_plugin";
import {
  set_image_suggestions,
  create_image_suggest_prose_plugin,
  type ImageSuggestPluginConfig,
} from "../adapters/image_suggest_plugin";
import type { EditorExtension, PluginContext } from "./types";

export function create_suggest_extension(ctx: PluginContext): EditorExtension {
  const plugins: Plugin[] = [];
  let image_suggest_config: ImageSuggestPluginConfig | null = null;

  plugins.push((create_slash_command_prose_plugin as () => Plugin)());
  plugins.push((create_date_suggest_prose_plugin as () => Plugin)());

  if (ctx.events.on_image_suggest_query) {
    image_suggest_config = {
      on_query: ctx.events.on_image_suggest_query,
      on_dismiss: () => {},
      base_note_path: ctx.get_note_path(),
    };
    plugins.push(
      create_image_suggest_prose_plugin(image_suggest_config) as Plugin,
    );
  }

  if (ctx.events.on_tag_suggest_query) {
    const tag_suggest_config: TagSuggestPluginConfig = {
      on_query: ctx.events.on_tag_suggest_query,
      on_dismiss: () => {},
    };
    plugins.push(create_tag_suggest_prose_plugin(tag_suggest_config) as Plugin);
  }

  if (ctx.events.on_cite_suggest_query) {
    const cite_suggest_config: CiteSuggestPluginConfig = {
      on_query: ctx.events.on_cite_suggest_query,
      on_dismiss: () => {},
      on_accept: ctx.events.on_cite_accept ?? (() => {}),
    };
    plugins.push(
      create_cite_suggest_prose_plugin(cite_suggest_config) as Plugin,
    );
  }

  return {
    plugins,
    on_note_path_change(path: string) {
      if (image_suggest_config) {
        image_suggest_config.base_note_path = path;
      }
    },
  };
}

export { set_tag_suggestions, set_cite_suggestions, set_image_suggestions };
export type { CiteSuggestionItem } from "../adapters/cite_suggest_plugin";
