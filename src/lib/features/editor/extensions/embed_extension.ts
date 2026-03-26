import type { Plugin } from "prosemirror-state";
import {
  create_excalidraw_embed_plugin,
  excalidraw_embed_plugin_key,
} from "../adapters/excalidraw_embed_plugin";
import {
  create_excalidraw_embed_view_plugin,
  type ExcalidrawEmbedCallbacks,
} from "../adapters/excalidraw_embed_view_plugin";
import {
  create_file_embed_plugin,
  file_embed_plugin_key,
} from "../adapters/file_embed_plugin";
import { create_file_embed_view_plugin } from "../adapters/file_embed_view_plugin";
import { as_asset_path } from "$lib/shared/types/ids";
import type { EditorExtension, PluginContext } from "./types";

export function create_embed_extension(ctx: PluginContext): EditorExtension {
  const plugins: Plugin[] = [];

  plugins.push(create_excalidraw_embed_plugin());

  const embed_callbacks: ExcalidrawEmbedCallbacks = {
    on_open_file: (path) => {
      if (ctx.events.on_internal_link_click) {
        ctx.events.on_internal_link_click(path, ctx.get_note_path(), "wiki");
      }
    },
  };
  if (ctx.load_svg_preview) {
    const load_svg = ctx.load_svg_preview;
    embed_callbacks.load_svg_preview = (path: string) => {
      const vid = ctx.get_vault_id();
      if (!vid) return Promise.resolve(null);
      return load_svg(vid, path);
    };
  }
  plugins.push(create_excalidraw_embed_view_plugin(embed_callbacks));

  plugins.push(create_file_embed_plugin());
  plugins.push(
    create_file_embed_view_plugin({
      on_open_file: (path) => {
        if (ctx.events.on_internal_link_click) {
          ctx.events.on_internal_link_click(path, ctx.get_note_path(), "wiki");
        }
      },
      resolve_asset_url: ctx.resolve_asset_url_for_vault
        ? (src) => {
            const vault_id = ctx.get_vault_id();
            if (!vault_id) return src;
            return ctx.resolve_asset_url_for_vault!(
              vault_id,
              as_asset_path(decodeURIComponent(src)),
            );
          }
        : undefined,
    }),
  );

  return { plugins };
}

export { excalidraw_embed_plugin_key, file_embed_plugin_key };
