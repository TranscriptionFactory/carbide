import { Plugin, PluginKey } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import { create_image_input_rule_prose_plugin } from "../adapters/image_input_rule_plugin";
import { create_image_toolbar_prose_plugin } from "../adapters/image_toolbar_plugin";
import { create_image_width_prose_plugin } from "../adapters/image_width_plugin";
import { create_image_paste_prose_plugin } from "../adapters/image_paste_plugin";
import { resolve_relative_asset_path } from "$lib/features/note";
import { as_asset_path } from "$lib/shared/types/ids";
import { create_logger } from "$lib/shared/utils/logger";
import { ImageOff, LoaderCircle } from "lucide-static";
import type { EditorExtension, PluginContext } from "./types";

const log = create_logger("image_extension");

const PLACEHOLDER_IMAGE_WIDTH = 1200;
const PLACEHOLDER_IMAGE_HEIGHT = 675;

function create_svg_data_uri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function create_icon_placeholder_data_uri(
  icon_svg: string,
  color: string,
): string {
  const svg = icon_svg
    .replace(/width="24"/, `width="${String(PLACEHOLDER_IMAGE_WIDTH)}"`)
    .replace(/height="24"/, `height="${String(PLACEHOLDER_IMAGE_HEIGHT)}"`)
    .replace(/stroke="currentColor"/g, `stroke="${color}"`);
  return create_svg_data_uri(svg);
}

const IMAGE_LOADING_PLACEHOLDER = create_icon_placeholder_data_uri(
  LoaderCircle,
  "#71717a",
);
const IMAGE_LOAD_ERROR_PLACEHOLDER = create_icon_placeholder_data_uri(
  ImageOff,
  "#b91c1c",
);

function create_image_block_view_plugin(ctx: PluginContext): Plugin {
  const resolved_url_cache = new Map<string, string>();
  const pending_listeners = new Map<string, Set<HTMLImageElement>>();

  function resolve_src(src: string, img: HTMLImageElement): string {
    if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return src;
    const cached = resolved_url_cache.get(src);
    if (cached) return cached;
    if (!ctx.resolve_asset_url_for_vault) return src;
    const vault_id = ctx.get_vault_id();
    if (!vault_id) return src;
    const vault_relative = resolve_relative_asset_path(
      ctx.get_note_path(),
      decodeURIComponent(src),
    );
    const result = ctx.resolve_asset_url_for_vault(
      vault_id,
      as_asset_path(vault_relative),
    );
    if (typeof result === "string") {
      resolved_url_cache.set(src, result);
      return result;
    }
    let listeners = pending_listeners.get(src);
    if (!listeners) {
      listeners = new Set();
      pending_listeners.set(src, listeners);
      void result
        .then((resolved_url) => {
          resolved_url_cache.set(src, resolved_url);
          const targets = pending_listeners.get(src);
          pending_listeners.delete(src);
          if (targets) {
            for (const t of targets) t.src = resolved_url;
          }
        })
        .catch((error: unknown) => {
          log.error("Failed to resolve asset URL", { error });
          resolved_url_cache.set(src, IMAGE_LOAD_ERROR_PLACEHOLDER);
          const targets = pending_listeners.get(src);
          pending_listeners.delete(src);
          if (targets) {
            for (const t of targets) t.src = IMAGE_LOAD_ERROR_PLACEHOLDER;
          }
        });
    }
    listeners.add(img);
    return IMAGE_LOADING_PLACEHOLDER;
  }

  return new Plugin({
    key: new PluginKey("image-block-view"),
    props: {
      nodeViews: {
        "image-block": (node, _view, _get_pos) => {
          const dom = document.createElement("div");
          dom.className = "milkdown-image-block";

          const wrapper = document.createElement("div");
          wrapper.className = "image-wrapper";
          dom.appendChild(wrapper);

          const img = document.createElement("img");
          img.alt = String(node.attrs["alt"] || node.attrs["caption"] || "");
          wrapper.appendChild(img);

          const width =
            typeof node.attrs["width"] === "string" ? node.attrs["width"] : "";
          if (width) wrapper.style.width = width;

          img.src = resolve_src(String(node.attrs["src"] || ""), img);

          const caption_el = document.createElement("figcaption");
          caption_el.className = "image-caption";
          const caption_text = String(node.attrs["caption"] || "");
          if (caption_text) {
            caption_el.textContent = caption_text;
            dom.appendChild(caption_el);
          }

          return {
            dom,
            update(updated: ProseNode): boolean {
              if (updated.type.name !== "image-block") return false;
              const new_src = String(updated.attrs["src"] || "");
              const resolved = resolve_src(new_src, img);
              if (img.src !== resolved) img.src = resolved;
              img.alt = String(
                updated.attrs["alt"] || updated.attrs["caption"] || "",
              );
              const new_width =
                typeof updated.attrs["width"] === "string"
                  ? updated.attrs["width"]
                  : "";
              wrapper.style.width = new_width || "";
              return true;
            },
            destroy() {
              for (const [, set] of pending_listeners) set.delete(img);
            },
            stopEvent() {
              return false;
            },
            ignoreMutation() {
              return true;
            },
          };
        },

        image: (node, _view, _get_pos) => {
          const img = document.createElement("img");
          img.alt = String(node.attrs["alt"] || "");
          if (node.attrs["title"]) img.title = String(node.attrs["title"]);
          img.src = resolve_src(String(node.attrs["src"] || ""), img);

          return {
            dom: img,
            update(updated: ProseNode): boolean {
              if (updated.type.name !== "image") return false;
              const new_src = String(updated.attrs["src"] || "");
              const resolved = resolve_src(new_src, img);
              if (img.src !== resolved) img.src = resolved;
              img.alt = String(updated.attrs["alt"] || "");
              return true;
            },
            destroy() {
              for (const [, set] of pending_listeners) set.delete(img);
            },
            stopEvent() {
              return false;
            },
            ignoreMutation() {
              return true;
            },
          };
        },
      },
    },
  });
}

export function create_image_extension(ctx: PluginContext): EditorExtension {
  const plugins: Plugin[] = [
    create_image_toolbar_prose_plugin(),
    create_image_width_prose_plugin(),
    create_image_block_view_plugin(ctx),
    create_image_input_rule_prose_plugin(),
  ];

  if (ctx.events.on_image_paste_requested) {
    plugins.push(
      create_image_paste_prose_plugin(ctx.events.on_image_paste_requested),
    );
  }

  return { plugins };
}
