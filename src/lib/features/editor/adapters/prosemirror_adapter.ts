import {
  EditorState,
  Plugin,
  PluginKey,
  TextSelection,
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Slice } from "prosemirror-model";
import type { Node as ProseNode } from "prosemirror-model";
import { history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, chainCommands, toggleMark } from "prosemirror-commands";
import {
  splitListItem,
  liftListItem,
  sinkListItem,
} from "prosemirror-schema-list";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { undo, redo } from "prosemirror-history";
import {
  parse_markdown,
  serialize_markdown,
  schema,
} from "./markdown_pipeline";
import type {
  CursorInfo,
  EditorSelectionSnapshot,
  PastedImagePayload,
} from "$lib/shared/types/editor";
import { create_link_tooltip_prose_plugin } from "./link_tooltip_plugin";
import { create_dirty_state_prose_plugin } from "./dirty_state_plugin";
import { dirty_state_plugin_key } from "./dirty_state_plugin";
import { create_markdown_link_input_rule_prose_plugin } from "./markdown_link_input_rule";
import { create_image_input_rule_prose_plugin } from "./image_input_rule_plugin";
import { create_block_input_rules_prose_plugin } from "./block_input_rules_plugin";
import { create_strikethrough_prose_plugin } from "./strikethrough_plugin";
import { create_inline_mark_input_rules_prose_plugin } from "./inline_mark_input_rules_plugin";
import { create_task_keymap_prose_plugin } from "./task_keymap_plugin";
import { create_heading_keymap_prose_plugin } from "./heading_keymap_plugin";
import { create_markdown_paste_prose_plugin } from "./markdown_paste_plugin";
import { create_image_paste_prose_plugin } from "./image_paste_plugin";
import {
  create_wiki_link_converter_prose_plugin,
  create_wiki_link_click_prose_plugin,
  wiki_link_plugin_key,
} from "./wiki_link_plugin";
import {
  set_wiki_suggestions,
  create_wiki_suggest_prose_plugin,
  type WikiSuggestPluginConfig,
} from "./wiki_suggest_plugin";
import {
  set_image_suggestions,
  create_image_suggest_prose_plugin,
  type ImageSuggestPluginConfig,
} from "./image_suggest_plugin";
import {
  create_editor_context_plugin_instance,
  editor_context_plugin_key,
} from "./editor_context_plugin";
import {
  find_highlight_plugin_key,
  create_find_highlight_prose_plugin,
} from "./find_highlight_plugin";
import { create_code_block_view_prose_plugin } from "./code_block_view_plugin";
import { create_table_toolbar_prose_plugin } from "./table_toolbar_plugin";
import { create_image_toolbar_prose_plugin } from "./image_toolbar_plugin";
import { create_image_width_prose_plugin } from "./image_width_plugin";
import { create_emoji_prose_plugin } from "./emoji_plugin";
import { create_typography_prose_plugin } from "./typography_plugin";
import { create_mark_escape_prose_plugin } from "./mark_escape_plugin";
import { create_paired_delimiter_prose_plugin } from "./paired_delimiter_plugin";
import { create_slash_command_prose_plugin } from "./slash_command_plugin";
import { create_date_suggest_prose_plugin } from "./date_suggest_plugin";
import {
  outline_plugin_key,
  create_outline_prose_plugin,
} from "./outline_plugin";
import { create_file_drop_prose_plugin } from "$lib/features/editor/domain/file_drop_plugin";
import {
  create_excalidraw_embed_plugin,
  excalidraw_embed_plugin_key,
} from "./excalidraw_embed_plugin";
import { create_excalidraw_embed_view_plugin } from "./excalidraw_embed_view_plugin";
import {
  create_file_embed_plugin,
  file_embed_plugin_key,
} from "./file_embed_plugin";
import { create_file_embed_view_plugin } from "./file_embed_view_plugin";
import { create_code_fence_language_prose_plugin } from "./code_fence_language_plugin";
import { create_details_view_prose_plugin } from "./details_view_plugin";
import { create_details_keymap_prose_plugin } from "./details_keymap_plugin";
import { create_shiki_prose_plugin } from "./shiki_plugin";
import {
  create_heading_fold_prose_plugin,
  toggle_heading_fold,
  collapse_all_headings,
  expand_all_headings,
} from "./heading_fold_plugin";
import { create_iwe_hover_plugin } from "$lib/features/editor/adapters/iwe_hover_plugin";
import { create_iwe_definition_plugin } from "$lib/features/editor/adapters/iwe_definition_plugin";
import { init_highlighter } from "./shiki_highlighter";
import {
  create_math_view_prose_plugin,
  create_math_inline_input_prose_plugin,
  create_math_block_input_rule_prose_plugin,
} from "./math_plugin";
import type { BufferConfig, EditorPort } from "$lib/features/editor/ports";
import type { AssetPath, VaultId } from "$lib/shared/types/ids";
import { as_asset_path } from "$lib/shared/types/ids";
import { resolve_relative_asset_path } from "$lib/features/note";
import {
  normalize_markdown_line_breaks,
  prepare_markdown_line_breaks_for_visual_editor,
} from "$lib/features/editor/domain/markdown_line_breaks";
import {
  prose_cursor_to_md_offset,
  md_offset_to_prose_pos,
} from "$lib/features/editor/adapters/cursor_offset_mapper";
import { count_words } from "$lib/shared/utils/count_words";
import { create_logger } from "$lib/shared/utils/logger";
import { ImageOff, LoaderCircle } from "lucide-static";

const log = create_logger("prosemirror_adapter");

init_highlighter();

function create_svg_data_uri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const PLACEHOLDER_IMAGE_WIDTH = 1200;
const PLACEHOLDER_IMAGE_HEIGHT = 675;

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

const LARGE_DOC_LINE_THRESHOLD = 8000;
const LARGE_DOC_CHAR_THRESHOLD = 400_000;

function count_lines(text: string): number {
  if (text === "") return 1;
  let lines = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lines++;
  }
  return lines;
}

function is_large_markdown(text: string): boolean {
  if (text.length >= LARGE_DOC_CHAR_THRESHOLD) return true;
  return count_lines(text) >= LARGE_DOC_LINE_THRESHOLD;
}

function count_newlines(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) n++;
  }
  return n;
}

function doc_text(doc: ProseNode): string {
  return doc.textBetween(0, doc.content.size, "\n");
}

function count_doc_words(doc: ProseNode): number {
  return count_words(doc_text(doc).replaceAll("\n", " "));
}

function count_doc_lines(doc: ProseNode): number {
  return count_newlines(doc_text(doc)) + 1;
}

function line_from_pos(doc: ProseNode, pos: number): number {
  return count_newlines(doc.textBetween(0, pos, "\n")) + 1;
}

function calculate_cursor_info(view: EditorView): CursorInfo {
  const { doc, selection } = view.state;
  const $from = selection?.$from;
  const line = $from ? line_from_pos(doc, $from.pos) : 1;
  const column = $from ? $from.parentOffset + 1 : 1;
  const total_lines = count_doc_lines(doc);
  const total_words = count_doc_words(doc);
  return { line, column, total_lines, total_words };
}

const cursor_plugin_key = new PluginKey("cursor-tracker");

function create_cursor_plugin(
  on_cursor_change: (info: CursorInfo) => void,
  on_selection_change?: (selection: EditorSelectionSnapshot | null) => void,
): Plugin {
  return new Plugin({
    key: cursor_plugin_key,
    view: () => {
      let cached: CursorInfo = {
        line: 1,
        column: 1,
        total_lines: 1,
        total_words: 0,
      };
      let prev_doc: ProseNode | null = null;
      let prev_selection: EditorState["selection"] | null = null;

      return {
        update: (view) => {
          const doc_changed = view.state.doc !== prev_doc;
          const selection_changed =
            doc_changed || view.state.selection !== prev_selection;
          prev_doc = view.state.doc;
          prev_selection = view.state.selection;

          if (doc_changed) {
            cached = calculate_cursor_info(view);
          } else {
            const { doc } = view.state;
            const $from = view.state.selection?.$from;
            cached = {
              ...cached,
              line: $from ? line_from_pos(doc, $from.pos) : 1,
              column: $from ? $from.parentOffset + 1 : 1,
            };
          }

          on_cursor_change(cached);

          if (selection_changed && on_selection_change) {
            const { from, to } = view.state.selection;
            if (from === to) {
              on_selection_change(null);
            } else {
              on_selection_change({
                text: view.state.doc.textBetween(from, to, "\n", "\n"),
                start: null,
                end: null,
              });
            }
          }
        },
      };
    },
  });
}

type ResolveAssetUrlForVault = (
  vault_id: VaultId,
  asset_path: AssetPath,
) => string | Promise<string>;

function create_markdown_change_plugin(
  on_change: (doc: ProseNode) => void,
): Plugin {
  return new Plugin({
    key: new PluginKey("markdown-change"),
    view: () => {
      let prev_doc: ProseNode | null = null;
      return {
        update: (view) => {
          if (view.state.doc !== prev_doc) {
            prev_doc = view.state.doc;
            on_change(view.state.doc);
          }
        },
      };
    },
  });
}

function create_image_block_view_plugin(input: {
  resolve_asset_url_for_vault: ResolveAssetUrlForVault | null;
  get_current_vault_id: () => VaultId | null;
  get_current_note_path: () => string;
}): Plugin {
  const resolved_url_cache = new Map<string, string>();
  const pending_listeners = new Map<string, Set<HTMLImageElement>>();

  function resolve_src(src: string, img: HTMLImageElement): string {
    if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return src;
    const cached = resolved_url_cache.get(src);
    if (cached) return cached;
    if (!input.resolve_asset_url_for_vault) return src;
    const vault_id = input.get_current_vault_id();
    if (!vault_id) return src;
    const vault_relative = resolve_relative_asset_path(
      input.get_current_note_path(),
      decodeURIComponent(src),
    );
    const result = input.resolve_asset_url_for_vault(
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

export function create_prosemirror_editor_port(args?: {
  resolve_asset_url_for_vault?: ResolveAssetUrlForVault;
}): EditorPort {
  const resolve_asset_url_for_vault = args?.resolve_asset_url_for_vault ?? null;

  return {
    start_session: (config) => {
      const { root, initial_markdown, note_path, vault_id, events } = config;
      const {
        on_markdown_change,
        on_dirty_state_change,
        on_cursor_change,
        on_selection_change,
        on_internal_link_click,
        on_external_link_click,
        on_image_paste_requested,
        on_file_drop_requested,
        on_wiki_suggest_query,
        on_image_suggest_query,
        on_outline_change,
        on_iwe_hover,
        on_iwe_definition,
        on_iwe_definition_navigate,
      } = events;

      let current_markdown = normalize_markdown(initial_markdown);
      let current_is_dirty = false;
      let view: EditorView | null = null;
      let outline_timer: ReturnType<typeof setTimeout> | undefined;
      let is_large_note = is_large_markdown(current_markdown);
      let current_note_path = note_path;
      let current_vault_id = vault_id;

      type BufferEntry = {
        state: EditorState;
        note_path: string;
        markdown: string;
        is_dirty: boolean;
      };

      const buffer_map = new Map<string, BufferEntry>();

      let wiki_suggest_config: WikiSuggestPluginConfig | null = null;
      let image_suggest_config: ImageSuggestPluginConfig | null = null;

      function normalize_markdown(raw: string): string {
        return normalize_markdown_line_breaks(raw);
      }

      function prepare_markdown_for_editor(raw: string): string {
        return prepare_markdown_line_breaks_for_visual_editor(raw);
      }

      const plugins: Plugin[] = [];

      const strikethrough_mark_type = schema.marks.strikethrough;
      const strong_mark_type = schema.marks.strong;
      const em_mark_type = schema.marks.em;
      const code_inline_mark_type = schema.marks.code_inline;
      plugins.push(
        keymap({
          "Mod-z": undo,
          "Mod-y": redo,
          "Mod-Shift-z": redo,
          ...(strong_mark_type
            ? { "Mod-b": toggleMark(strong_mark_type) }
            : {}),
          ...(em_mark_type ? { "Mod-i": toggleMark(em_mark_type) } : {}),
          ...(code_inline_mark_type
            ? { "Mod-e": toggleMark(code_inline_mark_type) }
            : {}),
          "Mod-Shift-e": (state, dispatch) => {
            const { $from, $to } = state.selection;
            const code_block_type = schema.nodes.code_block;

            if ($from.parent.type.name === "code_block") {
              if (!dispatch) return true;
              const pos = $from.before($from.depth);
              const node = state.doc.nodeAt(pos);
              if (!node) return false;
              const text = node.textContent;
              const lines = text.split("\n");
              const paragraphs = lines.map((line) =>
                schema.nodes.paragraph.create(
                  null,
                  line ? schema.text(line) : undefined,
                ),
              );
              const tr = state.tr.replaceWith(
                pos,
                pos + node.nodeSize,
                paragraphs,
              );
              dispatch(tr.scrollIntoView());
              return true;
            }

            if (!dispatch) return true;
            const range_start = $from.before($from.depth);
            const range_end = $to.after($to.depth);
            const text = state.doc.textBetween(
              range_start,
              range_end,
              "\n",
              "\n",
            );
            const code_block = code_block_type.create(
              { language: "" },
              text ? schema.text(text) : undefined,
            );
            const tr = state.tr.replaceWith(range_start, range_end, code_block);
            tr.setSelection(
              TextSelection.create(
                tr.doc,
                range_start + 1,
                range_start + 1 + text.length,
              ),
            );
            dispatch(tr.scrollIntoView());
            return true;
          },
          ...(strikethrough_mark_type
            ? { "Mod-Shift-x": toggleMark(strikethrough_mark_type) }
            : {}),
        }),
      );
      plugins.push((create_slash_command_prose_plugin as () => Plugin)());
      plugins.push((create_date_suggest_prose_plugin as () => Plugin)());
      plugins.push(create_code_fence_language_prose_plugin());
      const list_item_type = schema.nodes["list_item"];
      if (list_item_type) {
        plugins.push(
          keymap({
            Enter: chainCommands(
              splitListItem(list_item_type),
              liftListItem(list_item_type),
            ),
            Tab: chainCommands(sinkListItem(list_item_type), (state) => {
              return !state.selection.empty;
            }),
            "Shift-Tab": liftListItem(list_item_type),
          }),
        );
      }
      plugins.push(keymap(baseKeymap));
      plugins.push(history());
      plugins.push(dropCursor());
      plugins.push(gapCursor());

      plugins.push(create_math_view_prose_plugin());
      plugins.push(create_math_inline_input_prose_plugin());
      plugins.push(create_math_block_input_rule_prose_plugin(schema));
      plugins.push(create_details_view_prose_plugin());
      plugins.push(create_details_keymap_prose_plugin());
      plugins.push(create_code_block_view_prose_plugin());
      plugins.push(create_table_toolbar_prose_plugin());
      plugins.push(create_image_toolbar_prose_plugin());
      plugins.push(create_image_width_prose_plugin());
      plugins.push(
        create_image_block_view_plugin({
          resolve_asset_url_for_vault,
          get_current_vault_id: () => current_vault_id,
          get_current_note_path: () => current_note_path,
        }),
      );
      plugins.push(create_emoji_prose_plugin());
      plugins.push(create_typography_prose_plugin());
      const link_mark_type = schema.marks["link"];
      if (link_mark_type) {
        plugins.push(create_link_tooltip_prose_plugin(link_mark_type));
        plugins.push(
          create_markdown_link_input_rule_prose_plugin({
            link_type: link_mark_type,
          }),
        );
      }
      plugins.push(create_heading_keymap_prose_plugin());
      plugins.push(create_task_keymap_prose_plugin());
      plugins.push(create_image_input_rule_prose_plugin());
      plugins.push(create_excalidraw_embed_plugin());
      plugins.push(
        create_excalidraw_embed_view_plugin({
          on_open_file: (path) => {
            if (on_internal_link_click) {
              on_internal_link_click(path, current_note_path, "wiki");
            }
          },
        }),
      );
      plugins.push(create_file_embed_plugin());
      plugins.push(
        create_file_embed_view_plugin({
          on_open_file: (path) => {
            if (on_internal_link_click) {
              on_internal_link_click(path, current_note_path, "wiki");
            }
          },
          resolve_asset_url: resolve_asset_url_for_vault
            ? (src) => {
                const vault_id = current_vault_id;
                if (!vault_id) return src;
                return resolve_asset_url_for_vault(
                  vault_id,
                  as_asset_path(decodeURIComponent(src)),
                );
              }
            : undefined,
        }),
      );
      plugins.push(create_block_input_rules_prose_plugin());
      plugins.push(create_strikethrough_prose_plugin());
      plugins.push(create_inline_mark_input_rules_prose_plugin());
      plugins.push(
        create_editor_context_plugin_instance({
          note_path: current_note_path,
        }),
      );
      if (link_mark_type) {
        plugins.push(
          create_wiki_link_converter_prose_plugin({
            link_type: link_mark_type,
          }),
        );
      }
      plugins.push(create_find_highlight_prose_plugin());
      plugins.push(create_outline_prose_plugin());
      plugins.push(create_heading_fold_prose_plugin());
      plugins.push(create_shiki_prose_plugin());
      plugins.push(create_paired_delimiter_prose_plugin());
      plugins.push(create_mark_escape_prose_plugin());

      plugins.push(
        create_dirty_state_prose_plugin({
          on_dirty_state_change: (is_dirty) => {
            current_is_dirty = is_dirty;
            on_dirty_state_change(is_dirty);
          },
        }),
      );

      plugins.push(
        create_markdown_change_plugin((doc) => {
          const new_md = normalize_markdown(serialize_markdown(doc));
          if (new_md === current_markdown) return;
          current_markdown = new_md;
          on_markdown_change(new_md);

          if (on_outline_change) {
            clearTimeout(outline_timer);
            outline_timer = setTimeout(() => {
              emit_outline_headings();
            }, 300);
          }
        }),
      );

      plugins.push(create_markdown_paste_prose_plugin(parse_markdown));
      plugins.push(
        (
          create_file_drop_prose_plugin as (
            cb?: (payload: PastedImagePayload) => void,
          ) => Plugin
        )(on_file_drop_requested),
      );

      if (on_internal_link_click) {
        plugins.push(
          create_wiki_link_click_prose_plugin({
            on_internal_link_click,
            on_external_link_click: on_external_link_click ?? (() => {}),
          }),
        );
      }

      if (on_cursor_change) {
        plugins.push(
          create_cursor_plugin(on_cursor_change, on_selection_change),
        );
      }

      if (on_image_paste_requested) {
        plugins.push(create_image_paste_prose_plugin(on_image_paste_requested));
      }

      if (on_wiki_suggest_query) {
        wiki_suggest_config = {
          on_query: on_wiki_suggest_query,
          on_dismiss: () => {},
          base_note_path: current_note_path,
        };
        plugins.push(
          create_wiki_suggest_prose_plugin(wiki_suggest_config) as Plugin,
        );
      }

      if (on_image_suggest_query) {
        image_suggest_config = {
          on_query: on_image_suggest_query,
          on_dismiss: () => {},
          base_note_path: current_note_path,
        };
        plugins.push(
          create_image_suggest_prose_plugin(image_suggest_config) as Plugin,
        );
      }

      if (on_iwe_hover) {
        plugins.push(
          create_iwe_hover_plugin({
            on_hover: on_iwe_hover,
          }),
        );
      }

      if (on_iwe_definition) {
        plugins.push(
          create_iwe_definition_plugin({
            on_definition: on_iwe_definition,
            on_navigate: on_iwe_definition_navigate ?? (() => {}),
          }),
        );
      }

      let parsed_doc: ProseNode;
      try {
        parsed_doc = parse_markdown(
          prepare_markdown_for_editor(current_markdown),
        );
      } catch {
        parsed_doc =
          schema.topNodeType.createAndFill() ??
          schema.node("doc", null, schema.node("paragraph"));
      }

      const state = EditorState.create({
        schema,
        doc: parsed_doc,
        plugins,
      });

      let is_editable = true;

      view = new EditorView(root, {
        state,
        editable: () => is_editable,
        clipboardTextSerializer: (slice) => {
          let all_code = true;
          slice.content.forEach((node) => {
            if (node.type.name !== "code_block") all_code = false;
          });
          if (all_code && slice.content.childCount > 0) {
            const parts: string[] = [];
            slice.content.forEach((node) => {
              parts.push(node.textContent);
            });
            return parts.join("\n");
          }
          const wrap = schema.topNodeType.create(null, slice.content);
          return serialize_markdown(wrap);
        },
      });

      function run_view_action(fn: (v: EditorView) => void) {
        if (!view) return;
        try {
          fn(view);
        } catch (error: unknown) {
          log.error("Editor action failed", { error });
        }
      }

      function emit_outline_headings() {
        if (!on_outline_change || !view) return;
        const plugin_state = outline_plugin_key.getState(view.state);
        if (plugin_state) {
          on_outline_change(plugin_state.headings);
        }
      }

      function get_buffer_entry_from_view_state(
        state: EditorState,
      ): BufferEntry {
        const dirty_state = dirty_state_plugin_key.getState(state) as
          | { is_dirty?: boolean }
          | undefined;

        return {
          state,
          note_path: current_note_path,
          markdown: current_markdown,
          is_dirty: Boolean(dirty_state?.is_dirty ?? current_is_dirty),
        };
      }

      function sync_runtime_dirty_from_state(state: EditorState) {
        const dirty_state = dirty_state_plugin_key.getState(state) as
          | { is_dirty?: boolean }
          | undefined;
        current_is_dirty = Boolean(dirty_state?.is_dirty ?? false);
      }

      function save_current_buffer() {
        if (!current_note_path || !view) return;
        buffer_map.set(
          current_note_path,
          get_buffer_entry_from_view_state(view.state),
        );
      }

      function dispatch_editor_context_update(v: EditorView) {
        const context_tr = v.state.tr.setMeta(editor_context_plugin_key, {
          action: "update",
          note_path: current_note_path,
        });
        v.dispatch(context_tr);
      }

      function dispatch_full_scan(v: EditorView) {
        const embed_scan_tr = v.state.tr
          .setMeta(excalidraw_embed_plugin_key, { action: "full_scan" })
          .setMeta(file_embed_plugin_key, { action: "full_scan" });
        v.dispatch(embed_scan_tr);

        const full_scan_tr = v.state.tr.setMeta(wiki_link_plugin_key, {
          action: "full_scan",
        });
        v.dispatch(full_scan_tr);
      }

      function dispatch_mark_clean(v: EditorView) {
        const clean_tr = v.state.tr.setMeta(dirty_state_plugin_key, {
          action: "mark_clean",
        });
        v.dispatch(clean_tr);
      }

      if (!is_large_note) {
        run_view_action((v) => {
          dispatch_full_scan(v);
        });
      }

      save_current_buffer();
      emit_outline_headings();

      function mark_clean() {
        run_view_action((v) => {
          const tr = v.state.tr;
          tr.setMeta(dirty_state_plugin_key, { action: "mark_clean" });
          v.dispatch(tr);
        });
      }

      const handle = {
        destroy() {
          if (!view) return;
          clearTimeout(outline_timer);
          buffer_map.clear();
          view.destroy();
          view = null;
        },
        set_markdown(markdown: string) {
          if (!view) return;
          const normalized = normalize_markdown(markdown);
          is_large_note = is_large_markdown(normalized);
          current_markdown = normalized;

          let new_doc: ProseNode;
          try {
            new_doc = parse_markdown(prepare_markdown_for_editor(normalized));
          } catch {
            return;
          }

          const tr = view.state.tr.replaceWith(
            0,
            view.state.doc.content.size,
            new_doc.content,
          );
          view.dispatch(tr);

          if (!is_large_note) {
            run_view_action((v) => {
              dispatch_full_scan(v);
            });
          }
          save_current_buffer();
        },
        get_markdown() {
          return current_markdown;
        },
        insert_text_at_cursor(text: string) {
          run_view_action((v) => {
            const { state: s } = v;
            try {
              const doc = parse_markdown(text);
              const tr = s.tr.replaceSelection(new Slice(doc.content, 0, 0));
              v.dispatch(tr);
              v.focus();
            } catch {
              const tr = s.tr.insertText(
                text,
                s.selection.from,
                s.selection.to,
              );
              v.dispatch(tr.scrollIntoView());
              v.focus();
            }
          });
        },
        replace_selection(text: string) {
          run_view_action((v) => {
            const { state: s } = v;
            try {
              const doc = parse_markdown(text);
              const tr = s.tr.replaceSelection(new Slice(doc.content, 0, 0));
              v.dispatch(tr);
              v.focus();
            } catch {
              const tr = s.tr.insertText(
                text,
                s.selection.from,
                s.selection.to,
              );
              v.dispatch(tr.scrollIntoView());
              v.focus();
            }
          });
        },
        get_selected_text() {
          if (!view) return null;
          const { from, to } = view.state.selection;
          if (from === to) return null;
          return view.state.doc.textBetween(from, to, "\n", "\n");
        },
        mark_clean,
        is_dirty() {
          return current_is_dirty;
        },
        open_buffer(next_config: BufferConfig) {
          if (!view) return;

          const restore_policy = next_config.restore_policy;
          const should_reuse_cache = restore_policy === "reuse_cache";
          const is_same_path = next_config.note_path === current_note_path;
          if (!is_same_path) {
            save_current_buffer();
          }

          current_vault_id = next_config.vault_id;
          current_note_path = next_config.note_path;
          if (wiki_suggest_config) {
            wiki_suggest_config.base_note_path = current_note_path;
          }
          if (image_suggest_config) {
            image_suggest_config.base_note_path = current_note_path;
          }

          const v = view;

          const previous_selection =
            is_same_path && restore_policy === "fresh"
              ? v.state.selection
              : null;

          const saved_entry = should_reuse_cache
            ? buffer_map.get(next_config.note_path)
            : null;
          if (saved_entry) {
            v.updateState(saved_entry.state);
            current_markdown = saved_entry.markdown;
            is_large_note = is_large_markdown(current_markdown);
          } else {
            const normalized_initial_markdown = normalize_markdown(
              next_config.initial_markdown,
            );
            let new_parsed_doc: ProseNode;
            try {
              new_parsed_doc = parse_markdown(
                prepare_markdown_for_editor(normalized_initial_markdown),
              );
            } catch {
              new_parsed_doc =
                v.state.schema.topNodeType.createAndFill() ?? v.state.doc;
            }

            let selection: TextSelection | undefined;
            if (previous_selection) {
              try {
                const max_pos = new_parsed_doc.content.size;
                const anchor = Math.min(previous_selection.anchor, max_pos);
                const head = Math.min(previous_selection.head, max_pos);
                selection = TextSelection.create(new_parsed_doc, anchor, head);
              } catch {
                // positions invalid for new doc
              }
            }

            const state_config: Parameters<typeof EditorState.create>[0] = {
              schema: v.state.schema,
              doc: new_parsed_doc,
              plugins: v.state.plugins,
            };
            if (selection) {
              state_config.selection = selection;
            }
            const new_state = EditorState.create(state_config);

            v.updateState(new_state);
            current_markdown = normalized_initial_markdown;
            is_large_note = is_large_markdown(current_markdown);
          }

          dispatch_editor_context_update(v);

          if ((restore_policy === "fresh" || !saved_entry) && !is_large_note) {
            dispatch_full_scan(v);
            dispatch_mark_clean(v);
          }

          sync_runtime_dirty_from_state(v.state);

          buffer_map.set(
            current_note_path,
            get_buffer_entry_from_view_state(v.state),
          );

          on_markdown_change(current_markdown);
          on_dirty_state_change(current_is_dirty);
          emit_outline_headings();
        },
        rename_buffer(old_note_path: string, new_note_path: string) {
          if (old_note_path === new_note_path) return;

          const entry = buffer_map.get(old_note_path);
          buffer_map.delete(old_note_path);
          if (entry) {
            buffer_map.set(new_note_path, {
              ...entry,
              note_path: new_note_path,
            });
          }

          if (current_note_path !== old_note_path) return;
          current_note_path = new_note_path;
          if (wiki_suggest_config) {
            wiki_suggest_config.base_note_path = current_note_path;
          }
          if (image_suggest_config) {
            image_suggest_config.base_note_path = current_note_path;
          }

          run_view_action((v) => {
            dispatch_editor_context_update(v);
            buffer_map.set(
              current_note_path,
              get_buffer_entry_from_view_state(v.state),
            );
          });
        },
        close_buffer(note_path_to_close: string) {
          buffer_map.delete(note_path_to_close);
          if (current_note_path === note_path_to_close) {
            current_note_path = "";
          }
        },
        focus() {
          view?.focus();
        },
        set_wiki_suggestions(
          items: Array<{
            title: string;
            path: string;
            kind: "existing" | "planned";
            ref_count?: number | undefined;
          }>,
        ) {
          if (!view) return;
          set_wiki_suggestions(view, items);
        },
        set_image_suggestions(items: Array<{ path: string; name: string }>) {
          if (!view) return;
          set_image_suggestions(view, items);
        },
        update_find_state(query: string, selected_index: number) {
          run_view_action((v) => {
            const tr = v.state.tr.setMeta(find_highlight_plugin_key, {
              query,
              selected_index,
            });
            v.dispatch(tr);

            if (query) {
              const plugin_state = find_highlight_plugin_key.getState(v.state);
              const positions = plugin_state?.match_positions;
              const match = positions?.[selected_index];
              if (match) {
                const dom = v.domAtPos(match.from);
                const node =
                  dom.node instanceof HTMLElement
                    ? dom.node
                    : dom.node.parentElement;
                node?.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }
          });
        },
        replace_at_match(match_index: number, replacement: string) {
          run_view_action((v) => {
            const plugin_state = find_highlight_plugin_key.getState(v.state);
            if (!plugin_state?.match_positions.length) return;
            const match = plugin_state.match_positions[match_index];
            if (!match) return;
            v.dispatch(
              v.state.tr.insertText(replacement, match.from, match.to),
            );
          });
        },
        replace_all_matches(replacement: string) {
          run_view_action((v) => {
            const plugin_state = find_highlight_plugin_key.getState(v.state);
            if (!plugin_state?.match_positions.length) return;
            const sorted = [...plugin_state.match_positions].sort(
              (a, b) => b.from - a.from,
            );
            let tr = v.state.tr;
            for (const match of sorted) {
              tr = tr.insertText(replacement, match.from, match.to);
            }
            v.dispatch(tr);
          });
        },
        scroll_to_position(pos: number) {
          run_view_action((v) => {
            const node = v.nodeDOM(pos);
            if (node instanceof HTMLElement) {
              node.scrollIntoView({ behavior: "smooth", block: "start" });
            } else if (node instanceof Node) {
              (node as ChildNode).parentElement?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }
          });
        },
        get_cursor_markdown_offset() {
          if (!view) return 0;
          const { from } = view.state.selection;
          return prose_cursor_to_md_offset(
            view.state.doc,
            from,
            current_markdown,
          );
        },
        set_cursor_from_markdown_offset(offset: number) {
          if (!view) return;
          const pos = md_offset_to_prose_pos(
            view.state.doc,
            offset,
            current_markdown,
          );
          const clamped = Math.min(pos, view.state.doc.content.size);
          try {
            const selection = TextSelection.create(view.state.doc, clamped);
            view.dispatch(view.state.tr.setSelection(selection));
          } catch (error: unknown) {
            log.error("Failed to restore cursor position", { error });
          }
        },
        set_editable(editable: boolean) {
          is_editable = editable;
          if (view) {
            view.setProps({ editable: () => is_editable });
          }
        },
        toggle_heading_fold(pos?: number) {
          run_view_action((v) => toggle_heading_fold(v, pos));
        },
        collapse_all_heading_folds() {
          run_view_action((v) => collapse_all_headings(v));
        },
        expand_all_heading_folds() {
          run_view_action((v) => expand_all_headings(v));
        },
      };

      return Promise.resolve(handle);
    },
  };
}
