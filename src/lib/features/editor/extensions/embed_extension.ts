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
import {
  create_note_embed_plugin,
  note_embed_plugin_key,
} from "../adapters/note_embed_plugin";
import { create_note_embed_view_plugin } from "../adapters/note_embed_view_plugin";
import {
  create_html_embed_plugin,
  html_embed_plugin_key,
} from "../adapters/html_embed_input_plugin";
import { as_asset_path } from "$lib/shared/types/ids";
import type { EditorExtension, PluginContext } from "./types";

export function create_embed_extension(ctx: PluginContext): EditorExtension {
  const plugins: Plugin[] = [];

  const open_document = (path: string) => {
    ctx.events.on_open_document?.(path, ctx.get_note_path());
  };

  plugins.push(create_excalidraw_embed_plugin());
  plugins.push(create_html_embed_plugin());

  const embed_callbacks: ExcalidrawEmbedCallbacks = {
    on_open_file: open_document,
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
  const resolve_asset_url_for_vault = ctx.resolve_asset_url_for_vault;
  plugins.push(
    create_file_embed_view_plugin({
      on_open_file: open_document,
      resolve_asset_url: resolve_asset_url_for_vault
        ? async (src) => {
            const vault_id = ctx.get_vault_id();
            if (!vault_id) return src;
            const decoded = decodeURIComponent(src);
            let target = decoded;
            if (
              ctx.resolve_vault_file_path &&
              !decoded.startsWith("/") &&
              !decoded.startsWith("@linked/")
            ) {
              const resolved = await ctx.resolve_vault_file_path(
                vault_id,
                decoded,
              );
              if (resolved) target = resolved;
            }
            return resolve_asset_url_for_vault(vault_id, as_asset_path(target));
          }
        : undefined,
    }),
  );

  plugins.push(create_note_embed_plugin());
  if (ctx.note_embed) {
    const note_ctx = ctx.note_embed;
    plugins.push(
      create_note_embed_view_plugin({
        on_open_note: (path, fragment) => {
          if (ctx.events.on_internal_link_click) {
            const target = fragment ? `${path}#${fragment}` : path;
            ctx.events.on_internal_link_click(
              target,
              ctx.get_note_path(),
              "wiki",
            );
          }
        },
        read_note: note_ctx.read_note,
        parse_markdown: note_ctx.parse_markdown,
        subscribe_to_changes: note_ctx.subscribe_to_changes,
      }),
    );
  }

  return { plugins };
}

export {
  excalidraw_embed_plugin_key,
  file_embed_plugin_key,
  note_embed_plugin_key,
  html_embed_plugin_key,
};
