import type { Plugin } from "prosemirror-state";
import {
  create_slash_command_prose_plugin,
  type SlashCommandConfig,
} from "../adapters/slash_command_plugin";
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
import {
  set_at_palette_suggestions,
  create_at_palette_prose_plugin,
  type AtPalettePluginConfig,
} from "../adapters/at_palette_plugin";
import type { AtPaletteCommandItem } from "../adapters/at_palette_types";
import { COMMANDS_REGISTRY } from "$lib/features/search";
import type { EditorExtension, PluginContext } from "./types";

export function create_suggest_extension(
  ctx: PluginContext,
  slash_config?: SlashCommandConfig,
): EditorExtension {
  const plugins: Plugin[] = [];
  let image_suggest_config: ImageSuggestPluginConfig | null = null;

  plugins.push(
    (
      create_slash_command_prose_plugin as (
        config?: SlashCommandConfig,
      ) => Plugin
    )(slash_config),
  );

  const at_palette_config: AtPalettePluginConfig = {
    on_note_query: ctx.events.on_at_palette_note_query,
    on_heading_query: ctx.events.on_at_palette_heading_query,
    on_tag_query: ctx.events.on_at_palette_tag_query,
    on_cite_query: ctx.events.on_at_palette_cite_query,
    on_cite_accept: ctx.events.on_cite_accept,
    on_command_execute: ctx.events.on_at_palette_command_execute,
    get_commands: (): AtPaletteCommandItem[] =>
      COMMANDS_REGISTRY.map((cmd) => ({
        category: "commands" as const,
        id: cmd.id,
        label: cmd.label,
        description: cmd.description,
        icon: cmd.icon,
      })),
  };
  plugins.push(create_at_palette_prose_plugin(at_palette_config) as Plugin);

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

export {
  set_tag_suggestions,
  set_cite_suggestions,
  set_image_suggestions,
  set_at_palette_suggestions,
};
export type { CiteSuggestionItem } from "../adapters/cite_suggest_plugin";
