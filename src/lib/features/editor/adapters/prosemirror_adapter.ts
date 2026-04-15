import {
  EditorState,
  Plugin,
  PluginKey,
  TextSelection,
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Slice } from "prosemirror-model";
import type { Node as ProseNode } from "prosemirror-model";
import {
  parse_markdown,
  serialize_markdown,
  schema,
} from "./markdown_pipeline";
import { ySyncPlugin } from "y-prosemirror";
import type { XmlFragment as YXmlFragment } from "yjs";
import type { BufferConfig, EditorPort } from "$lib/features/editor/ports";
import type { YDocManager } from "./ydoc_manager";
import type { AssetPath, VaultId } from "$lib/shared/types/ids";
import { normalize_markdown_line_breaks } from "$lib/features/editor/domain/markdown_line_breaks";
import {
  prose_cursor_to_md_offset,
  md_offset_to_prose_pos,
} from "$lib/features/editor/adapters/cursor_offset_mapper";
import { count_words } from "$lib/shared/utils/count_words";
import { create_logger } from "$lib/shared/utils/logger";
import { init_highlighter } from "./shiki_highlighter";
import type {
  CursorInfo,
  EditorSelectionSnapshot,
} from "$lib/shared/types/editor";

import {
  assemble_extensions,
  editor_context_plugin_key,
  outline_plugin_key,
  dirty_state_plugin_key,
  find_highlight_plugin_key,
  wiki_link_plugin_key,
  excalidraw_embed_plugin_key,
  file_embed_plugin_key,
  set_wiki_suggestions,
  set_heading_suggestions,
  set_image_suggestions,
  set_tag_suggestions,
  set_cite_suggestions,
  toggle_heading_fold,
  collapse_all_headings,
  expand_all_headings,
  restore_heading_folds,
} from "$lib/features/editor/extensions";
import { heading_fold_plugin_key } from "$lib/features/editor/adapters/heading_fold_plugin";
import type {
  ResolveAssetUrlForVault,
  CiteSuggestionItem,
} from "$lib/features/editor/extensions";
import type { ToolbarConfig } from "$lib/features/editor/extensions/toolbar_extension";
import type { SlashCommandConfig } from "$lib/features/editor/adapters/slash_command_plugin";
import type { ToolbarVisibility } from "$lib/shared/types/editor_settings";
import { trigger_lsp_hover } from "./lsp_hover_plugin";

const log = create_logger("prosemirror_adapter");

init_highlighter();

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

const STATUS_TO_CHECKED: Record<"todo" | "doing" | "done", boolean | null> = {
  todo: false,
  doing: null,
  done: true,
};

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

export function create_prosemirror_editor_port(args?: {
  resolve_asset_url_for_vault?: ResolveAssetUrlForVault;
  load_svg_preview?: (vault_id: string, path: string) => Promise<string | null>;
  ydoc_manager?: YDocManager;
  slash_config?: SlashCommandConfig;
}): EditorPort {
  const resolve_asset_url_for_vault = args?.resolve_asset_url_for_vault ?? null;
  const load_svg_preview_fn = args?.load_svg_preview ?? undefined;
  const ydoc_manager = args?.ydoc_manager ?? null;
  const slash_config = args?.slash_config;

  return {
    start_session: (config) => {
      const { root, initial_markdown, note_path, vault_id, events } = config;
      const {
        on_markdown_change,
        on_dirty_state_change,
        on_cursor_change,
        on_selection_change,
        on_outline_change,
      } = events;

      let current_markdown = normalize_markdown(initial_markdown);
      let saved_markdown = current_markdown;
      let current_is_dirty = false;
      let suppress_change_echo = false;
      let view: EditorView | null = null;
      let outline_timer: ReturnType<typeof setTimeout> | undefined;
      let is_large_note = is_large_markdown(current_markdown);
      let current_note_path = note_path;
      let current_vault_id = vault_id;

      type BufferEntry = {
        state: EditorState;
        note_path: string;
        markdown: string;
        saved_markdown: string;
        is_dirty: boolean;
      };

      const buffer_map = new Map<string, BufferEntry>();

      function normalize_markdown(raw: string): string {
        return normalize_markdown_line_breaks(raw);
      }

      function prepare_markdown_for_editor(raw: string): string {
        return normalize_markdown_line_breaks(raw);
      }

      // --- Assemble plugins via extensions ---

      const toolbar_config: ToolbarConfig = {
        toolbar_visibility: "always_hide",
      };

      const assembled = assemble_extensions(
        {
          events,
          get_note_path: () => current_note_path,
          get_vault_id: () => current_vault_id,
          resolve_asset_url_for_vault,
          load_svg_preview: load_svg_preview_fn,
          use_yjs: !!ydoc_manager,
        },
        toolbar_config,
        slash_config,
      );

      // --- Yjs integration ---

      let current_xml_fragment: YXmlFragment | null = null;

      function create_yjs_plugins(xml_fragment: YXmlFragment): Plugin[] {
        return [ySyncPlugin(xml_fragment)];
      }

      function hydrate_ydoc(
        note_path_key: string,
        pm_doc: ProseNode,
      ): YXmlFragment {
        if (!ydoc_manager) {
          throw new Error("ydoc_manager required for Yjs integration");
        }
        const entry = ydoc_manager.hydrate_fresh(note_path_key, pm_doc);
        return entry.xml_fragment;
      }

      function get_or_create_ydoc(
        note_path_key: string,
        pm_doc: ProseNode,
      ): YXmlFragment {
        if (!ydoc_manager) {
          throw new Error("ydoc_manager required for Yjs integration");
        }
        const entry = ydoc_manager.get_or_create(note_path_key, pm_doc);
        return entry.xml_fragment;
      }

      // --- Build base plugins (without ySyncPlugin — that's per-buffer) ---

      const base_plugins: Plugin[] = [...assembled.plugins];

      // Session-specific plugins (tightly coupled to session state)
      base_plugins.push(
        create_markdown_change_plugin((doc) => {
          if (suppress_change_echo) return;
          const new_md = normalize_markdown(serialize_markdown(doc));
          if (new_md === current_markdown) return;
          current_markdown = new_md;

          const now_dirty = current_markdown !== saved_markdown;
          if (now_dirty !== current_is_dirty) {
            current_is_dirty = now_dirty;
            on_dirty_state_change(current_is_dirty);
          }

          on_markdown_change(new_md);

          if (on_outline_change) {
            clearTimeout(outline_timer);
            outline_timer = setTimeout(() => {
              emit_outline_headings();
            }, 300);
          }
        }),
      );

      if (on_cursor_change) {
        base_plugins.push(
          create_cursor_plugin(on_cursor_change, on_selection_change),
        );
      }

      // --- Create editor state ---

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

      function build_plugins(xml_fragment: YXmlFragment | null): Plugin[] {
        if (xml_fragment) {
          return [...create_yjs_plugins(xml_fragment), ...base_plugins];
        }
        return [...base_plugins];
      }

      if (ydoc_manager) {
        current_xml_fragment = hydrate_ydoc(note_path, parsed_doc);
      }

      const state = EditorState.create({
        schema,
        doc: parsed_doc,
        plugins: build_plugins(current_xml_fragment),
      });

      let is_editable = true;

      let spellcheck_enabled = config.spellcheck ?? true;

      view = new EditorView(root, {
        state,
        editable: () => is_editable,
        attributes: { spellcheck: String(spellcheck_enabled) },
        dispatchTransaction: (tr) => {
          if (!view) return;
          try {
            const new_state = view.state.apply(tr);
            view.updateState(new_state);
          } catch (error: unknown) {
            log.error("Transaction dispatch failed", { error });
          }
        },
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
          const md = serialize_markdown(wrap);
          return md.replace(/&#x([0-9A-Fa-f]+);/g, (_match, hex) =>
            String.fromCharCode(parseInt(hex, 16)),
          );
        },
      });

      // --- Session helpers ---

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
        return {
          state,
          note_path: current_note_path,
          markdown: current_markdown,
          saved_markdown,
          is_dirty: current_is_dirty,
        };
      }

      function sync_runtime_dirty_from_buffer(entry: BufferEntry) {
        current_is_dirty = entry.is_dirty;
        saved_markdown = entry.saved_markdown;
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
        saved_markdown = current_markdown;
        current_is_dirty = false;
      }

      if (!is_large_note) {
        run_view_action((v) => {
          dispatch_full_scan(v);
        });
      }

      saved_markdown = current_markdown;
      current_is_dirty = false;

      save_current_buffer();
      emit_outline_headings();

      function mark_clean(saved_content?: string) {
        run_view_action((v) => {
          const tr = v.state.tr;
          tr.setMeta(dirty_state_plugin_key, { action: "mark_clean" });
          v.dispatch(tr);
        });
        if (saved_content !== undefined) {
          saved_markdown = normalize_markdown(saved_content);
        } else {
          saved_markdown = current_markdown;
        }
        if (current_is_dirty) {
          current_is_dirty = false;
          on_dirty_state_change(false);
        }
      }

      // --- Session handle ---

      const handle = {
        destroy() {
          if (!view) return;
          clearTimeout(outline_timer);
          buffer_map.clear();
          ydoc_manager?.clear();
          current_xml_fragment = null;
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

          if (ydoc_manager && current_xml_fragment) {
            current_xml_fragment = hydrate_ydoc(current_note_path, new_doc);
            const new_state = EditorState.create({
              schema,
              doc: new_doc,
              plugins: build_plugins(current_xml_fragment),
            });
            view.updateState(new_state);
          } else {
            const tr = view.state.tr.replaceWith(
              0,
              view.state.doc.content.size,
              new_doc.content,
            );
            tr.setMeta("addToHistory", false);
            view.dispatch(tr);
          }

          const now_dirty = current_markdown !== saved_markdown;
          if (now_dirty !== current_is_dirty) {
            current_is_dirty = now_dirty;
            on_dirty_state_change(now_dirty);
          }

          if (!is_large_note) {
            run_view_action((v) => {
              dispatch_full_scan(v);
            });
          }
          save_current_buffer();
        },
        apply_markdown_diff(new_markdown: string): boolean {
          if (!view) return false;
          const normalized = normalize_markdown(new_markdown);
          if (normalized === current_markdown) return false;

          let new_doc: ProseNode;
          try {
            new_doc = parse_markdown(prepare_markdown_for_editor(normalized));
          } catch {
            return false;
          }

          const old_content = view.state.doc.content;
          const new_content = new_doc.content;
          const start = old_content.findDiffStart(new_content);
          if (start == null) return false;

          const end = old_content.findDiffEnd(new_content);
          if (!end) return false;

          const old_end = Math.max(start, end.a);
          const new_end = Math.max(start, end.b);
          const slice = new_content.cut(start, new_end);

          const tr = view.state.tr.replace(
            start,
            old_end,
            new Slice(slice, 0, 0),
          );
          suppress_change_echo = true;
          try {
            view.dispatch(tr);
          } finally {
            suppress_change_echo = false;
          }

          is_large_note = is_large_markdown(normalized);
          current_markdown = normalized;

          if (!is_large_note) {
            run_view_action((v) => {
              dispatch_full_scan(v);
            });
          }
          save_current_buffer();
          return true;
        },
        replace_doc_undoable(markdown: string) {
          if (!view) return;
          const normalized = normalize_markdown(markdown);
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
          suppress_change_echo = true;
          try {
            view.dispatch(tr);
          } finally {
            suppress_change_echo = false;
          }

          is_large_note = is_large_markdown(normalized);
          current_markdown = normalized;

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
          assembled.on_note_path_change(current_note_path);

          const v = view;

          const previous_selection =
            is_same_path && restore_policy === "fresh"
              ? v.state.selection
              : null;

          const saved_entry = should_reuse_cache
            ? buffer_map.get(next_config.note_path)
            : null;
          if (saved_entry && !ydoc_manager) {
            v.updateState(saved_entry.state);
            current_markdown = saved_entry.markdown;
            sync_runtime_dirty_from_buffer(saved_entry);
            is_large_note = is_large_markdown(current_markdown);
          } else if (saved_entry && ydoc_manager) {
            current_markdown = saved_entry.markdown;
            sync_runtime_dirty_from_buffer(saved_entry);
            is_large_note = is_large_markdown(current_markdown);

            const saved_fold_state = heading_fold_plugin_key.getState(
              saved_entry.state,
            );

            const cached_ydoc = ydoc_manager.get(next_config.note_path);
            if (cached_ydoc) {
              current_xml_fragment = cached_ydoc.xml_fragment;
            } else {
              let pm_doc: ProseNode;
              try {
                pm_doc = parse_markdown(
                  prepare_markdown_for_editor(current_markdown),
                );
              } catch {
                pm_doc =
                  v.state.schema.topNodeType.createAndFill() ?? v.state.doc;
              }
              current_xml_fragment = get_or_create_ydoc(
                next_config.note_path,
                pm_doc,
              );
            }

            const new_state = EditorState.create({
              schema: v.state.schema,
              doc: saved_entry.state.doc,
              plugins: build_plugins(current_xml_fragment),
            });
            v.updateState(new_state);

            if (saved_fold_state && saved_fold_state.folded.size > 0) {
              restore_heading_folds(v, saved_fold_state.folded);
            }
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

            if (ydoc_manager) {
              current_xml_fragment =
                restore_policy === "fresh"
                  ? hydrate_ydoc(next_config.note_path, new_parsed_doc)
                  : get_or_create_ydoc(next_config.note_path, new_parsed_doc);
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
              plugins: build_plugins(current_xml_fragment),
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
          } else if (!saved_entry) {
            saved_markdown = current_markdown;
            current_is_dirty = false;
          }

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

          ydoc_manager?.rename(old_note_path, new_note_path);

          if (current_note_path !== old_note_path) return;
          current_note_path = new_note_path;
          assembled.on_note_path_change(current_note_path);

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
          ydoc_manager?.evict(note_path_to_close);
          if (current_note_path === note_path_to_close) {
            current_note_path = "";
            current_xml_fragment = null;
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
        set_heading_suggestions(items: Array<{ text: string; level: number }>) {
          if (!view) return;
          set_heading_suggestions(view, items);
        },
        set_image_suggestions(items: Array<{ path: string; name: string }>) {
          if (!view) return;
          set_image_suggestions(view, items);
        },
        set_tag_suggestions(items: Array<{ tag: string; count: number }>) {
          if (!view) return;
          set_tag_suggestions(view, items);
        },
        set_cite_suggestions(items: CiteSuggestionItem[]) {
          if (!view) return;
          set_cite_suggestions(view, items);
        },
        update_find_state(query: string, selected_index: number): number {
          let match_count = 0;
          run_view_action((v) => {
            const tr = v.state.tr.setMeta(find_highlight_plugin_key, {
              query,
              selected_index,
            });
            v.dispatch(tr);

            const plugin_state = find_highlight_plugin_key.getState(v.state);
            match_count = plugin_state?.match_positions.length ?? 0;

            if (query) {
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
          return match_count;
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
        set_spellcheck(enabled: boolean) {
          spellcheck_enabled = enabled;
          if (view) {
            view.setProps({
              attributes: { spellcheck: String(spellcheck_enabled) },
            });
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
        update_task_checkbox(
          line_number: number,
          status: "todo" | "doing" | "done",
        ) {
          const v = view;
          if (!v) return false;
          const checked_val = STATUS_TO_CHECKED[status];
          let found = false;
          v.state.doc.descendants((node, pos) => {
            if (found) return false;
            if (node.type.name !== "list_item") return true;
            if (node.attrs["checked"] === undefined) return true;
            const node_line = line_from_pos(v.state.doc, pos) + 1;
            if (node_line !== line_number) return true;
            const tr = v.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              checked: checked_val,
            });
            v.dispatch(tr);
            found = true;
            return false;
          });
          return found;
        },
        set_toolbar_visibility(mode: ToolbarVisibility) {
          toolbar_config.toolbar_visibility = mode;
        },
        trigger_hover_at_cursor() {
          if (!view) return;
          const { from } = view.state.selection;
          trigger_lsp_hover(view, from);
        },
      };

      return Promise.resolve(handle);
    },
  };
}
