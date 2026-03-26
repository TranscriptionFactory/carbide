import type { Plugin } from "prosemirror-state";
import { parse_markdown } from "../adapters/markdown_pipeline";
import { create_markdown_paste_prose_plugin } from "../adapters/markdown_paste_plugin";
import { create_file_drop_prose_plugin } from "../domain/file_drop_plugin";
import type { PastedImagePayload } from "$lib/shared/types/editor";
import type { EditorExtension, PluginContext } from "./types";

export function create_paste_extension(ctx: PluginContext): EditorExtension {
  const plugins: Plugin[] = [];

  plugins.push(create_markdown_paste_prose_plugin(parse_markdown));
  plugins.push(
    (
      create_file_drop_prose_plugin as (
        cb?: (payload: PastedImagePayload) => void,
      ) => Plugin
    )(ctx.events.on_file_drop_requested),
  );

  return { plugins };
}
