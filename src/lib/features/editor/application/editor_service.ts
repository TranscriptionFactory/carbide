import type {
  BufferRestorePolicy,
  InternalLinkSource,
  EditorPort,
  EditorSession,
  WikiQueryEvent,
} from "$lib/features/editor/ports";
import type { CiteSuggestionItem } from "$lib/features/editor/adapters/cite_suggest_plugin";
import type { AtPaletteItem } from "$lib/features/editor/adapters/at_palette_types";
import type { ToolbarVisibility } from "$lib/shared/types/editor_settings";
import type { Diagnostic } from "$lib/features/diagnostics";
import {
  match_query,
  format_authors,
  extract_year,
  sync_reference_to_markdown,
} from "$lib/features/reference";
import type { CslItem } from "$lib/features/reference";
import type {
  OpenNoteState,
  CursorInfo,
  EditorAiContext,
  EditorSelectionSnapshot,
  PastedImagePayload,
} from "$lib/shared/types/editor";
import type { MarkdownText, NoteId, NotePath } from "$lib/shared/types/ids";
import { as_markdown_text } from "$lib/shared/types/ids";
import type { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import type { VaultStore } from "$lib/features/vault";
import type { OpStore } from "$lib/app";
import type { SearchService } from "$lib/features/search";
import type { OutlineStore } from "$lib/features/outline";
import type { AssetsPort } from "$lib/features/note";
import type { TagPort } from "$lib/features/tags";
import { normalize_markdown_line_breaks } from "$lib/features/editor/domain/markdown_line_breaks";
import { is_draft_note_path } from "$lib/features/note";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("editor_service");

function note_name_from_path(path: string): string {
  const leaf = path.split("/").at(-1) ?? path;
  return leaf.endsWith(".md") ? leaf.slice(0, -3) : leaf;
}

export type EditorServiceCallbacks = {
  on_command_execute?: (command_id: string) => void;
  on_internal_link_click: (
    raw_path: string,
    base_note_path: string,
    source: InternalLinkSource,
  ) => void;
  on_external_link_click: (url: string) => void;
  on_anchor_link_click?: (fragment: string) => void;
  on_image_paste_requested: (
    note_id: NoteId,
    note_path: NotePath,
    image: PastedImagePayload,
  ) => void;
  on_file_drop_requested: (
    note_id: NoteId,
    note_path: NotePath,
    file: PastedImagePayload,
  ) => void;
  on_markdown_lsp_hover?: (
    file_path: string,
    line: number,
    character: number,
  ) => Promise<{ contents: string | null } | null>;
  on_markdown_lsp_hover_result?: (
    result: { contents: string; line: number; character: number } | null,
  ) => void;
  on_markdown_lsp_definition?: (
    file_path: string,
    line: number,
    character: number,
  ) => Promise<
    Array<{
      uri: string;
      range: {
        start_line: number;
        start_character: number;
        end_line: number;
        end_character: number;
      };
    }>
  >;
  on_markdown_lsp_definition_navigate?: (uri: string) => void;
  on_markdown_lsp_completion?: (
    file_path: string,
    line: number,
    character: number,
  ) => Promise<
    Array<{ label: string; detail: string | null; insert_text: string | null }>
  >;
  get_markdown_lsp_completion_trigger_characters?: () => string[];
  on_markdown_lsp_inlay_hints?: (file_path: string) => Promise<
    Array<{
      position_line: number;
      position_character: number;
      label: string;
    }>
  >;
  on_markdown_lsp_code_actions?: (
    file_path: string,
    start_line: number,
    start_character: number,
    end_line: number,
    end_character: number,
  ) => Promise<
    Array<{
      title: string;
      kind: string | null;
      data: string | null;
      raw_json: string;
    }>
  >;
  on_markdown_lsp_code_action_resolve?: (action: {
    title: string;
    kind: string | null;
    data: string | null;
    raw_json: string;
  }) => void;
  on_lsp_code_actions?: (
    file_path: string,
    start_line: number,
    start_character: number,
    end_line: number,
    end_character: number,
  ) => Promise<
    Array<{
      title: string;
      kind: string | null;
      data: string | null;
      raw_json: string;
      source: string;
    }>
  >;
  on_lsp_code_action_resolve?: (action: {
    title: string;
    kind: string | null;
    data: string | null;
    raw_json: string;
    source: string;
  }) => void;
};

type EditorFlushResult = {
  note_id: NoteId;
  markdown: MarkdownText;
};

type EditorSessionEvents = Parameters<EditorPort["start_session"]>[0]["events"];

export class EditorService {
  private session: EditorSession | null = null;
  private host_root: HTMLDivElement | null = null;
  private active_note: OpenNoteState | null = null;
  private session_generation = 0;
  private native_link_hover_enabled = true;
  private native_wiki_suggest_enabled = true;
  private native_link_click_enabled = true;

  constructor(
    private readonly editor_port: EditorPort,
    private readonly vault_store: VaultStore,
    private readonly editor_store: EditorStore,
    private readonly op_store: OpStore,
    private readonly callbacks: EditorServiceCallbacks,
    private readonly search_service?: SearchService,
    private readonly outline_store?: OutlineStore,
    private readonly assets_port?: AssetsPort,
    private readonly tag_port?: TagPort,
    private readonly reference_store?: { library_items: CslItem[] },
  ) {}

  is_mounted(): boolean {
    return this.host_root !== null && this.session !== null;
  }

  async mount(args: {
    root: HTMLDivElement;
    note: OpenNoteState;
  }): Promise<void> {
    this.host_root = args.root;
    this.active_note = args.note;

    this.op_store.start("editor.mount", Date.now());
    try {
      await this.recreate_session();
      this.editor_store.session_revision++;
      this.focus();
      this.op_store.succeed("editor.mount");
    } catch (error) {
      log.error("Editor mount failed", { error });
      this.op_store.fail("editor.mount", error_message(error));
    }
  }

  unmount() {
    this.invalidate_session_generation();
    this.teardown_session();
    this.host_root = null;
    this.active_note = null;
    this.editor_store.session_revision++;
  }

  set_active_note(note: OpenNoteState): void {
    this.active_note = note;
  }

  open_buffer(
    note: OpenNoteState,
    restore_policy: BufferRestorePolicy = "reuse_cache",
  ): void {
    this.active_note = note;

    if (!this.host_root || !this.session) return;

    this.session.open_buffer({
      note_path: note.meta.path,
      vault_id: this.vault_store.vault?.id ?? null,
      initial_markdown: note.markdown,
      restore_policy,
    });
    this.focus();
  }

  rename_buffer(old_note_path: NotePath, new_note_path: NotePath) {
    if (this.active_note?.meta.path === old_note_path) {
      const name = note_name_from_path(new_note_path);
      this.active_note = {
        ...this.active_note,
        meta: {
          ...this.active_note.meta,
          id: new_note_path,
          path: new_note_path,
          name,
          title: name,
        },
      };
    }
    this.session?.rename_buffer(old_note_path, new_note_path);
  }

  insert_text(text: string) {
    const open_note = this.editor_store.open_note;
    if (!open_note) return;
    this.session?.insert_text_at_cursor(text);
    this.editor_store.set_dirty(open_note.meta.id, true);
  }

  get_ai_context(): EditorAiContext | null {
    const open_note = this.editor_store.open_note;
    if (!open_note) return null;

    const markdown =
      this.session && this.editor_store.editor_mode === "visual"
        ? as_markdown_text(this.session.get_markdown())
        : open_note.markdown;

    if (markdown !== open_note.markdown) {
      this.editor_store.set_markdown(open_note.meta.id, markdown);
    }

    const selection =
      this.editor_store.editor_mode === "source"
        ? this.editor_store.selection
        : this.resolve_visual_selection();

    return {
      note_id: open_note.meta.id,
      note_path: open_note.meta.path,
      note_title: open_note.meta.title || open_note.meta.name,
      markdown,
      selection,
    };
  }

  apply_ai_output(
    target: "selection" | "full_note",
    output: string,
    selection: EditorSelectionSnapshot | null,
  ): boolean {
    const open_note = this.editor_store.open_note;
    if (!open_note) return false;

    if (target === "selection") {
      if (this.editor_store.editor_mode === "source") {
        if (!selection || selection.start === null || selection.end === null) {
          return false;
        }

        const next_markdown = `${open_note.markdown.slice(0, selection.start)}${output}${open_note.markdown.slice(selection.end)}`;
        this.editor_store.set_markdown(
          open_note.meta.id,
          as_markdown_text(next_markdown),
        );
        this.editor_store.set_dirty(open_note.meta.id, true);
        this.editor_store.set_selection(open_note.meta.id, {
          text: output,
          start: selection.start,
          end: selection.start + output.length,
        });
        return true;
      }

      if (this.session?.replace_selection) {
        this.session.replace_selection(output);
        this.editor_store.set_dirty(open_note.meta.id, true);
        return true;
      }

      if (this.session) {
        this.session.insert_text_at_cursor(output);
        this.editor_store.set_dirty(open_note.meta.id, true);
        return true;
      }

      return false;
    }

    if (this.session && this.editor_store.editor_mode === "visual") {
      this.session.set_markdown(output);
    }
    this.editor_store.set_markdown(open_note.meta.id, as_markdown_text(output));
    this.editor_store.set_dirty(open_note.meta.id, true);
    this.editor_store.set_selection(open_note.meta.id, null);
    return true;
  }

  mark_clean() {
    const markdown = this.editor_store.open_note?.markdown;
    this.session?.mark_clean(markdown);
  }

  mark_clean_from_editor() {
    this.session?.mark_clean();
  }

  sync_visual_from_markdown(markdown: string) {
    if (!this.session) return;
    const current = this.session.get_markdown();
    if (current === markdown) return;
    this.session.set_markdown(markdown);
  }

  sync_visual_from_markdown_undoable(markdown: string) {
    if (!this.session?.replace_doc_undoable) {
      this.sync_visual_from_markdown(markdown);
      return;
    }
    const current = this.session.get_markdown();
    if (current === markdown) return;
    this.session.replace_doc_undoable(markdown);
  }

  sync_visual_from_markdown_diff(markdown: string): boolean {
    if (!this.session?.apply_markdown_diff) return false;
    return this.session.apply_markdown_diff(markdown);
  }

  flush(): EditorFlushResult | null {
    if (!this.active_note) return null;

    const mode = this.editor_store.editor_mode;
    if (
      (mode === "source" || this.editor_store.split_view) &&
      this.editor_store.source_content_getter !== null
    ) {
      const markdown = this.editor_store.source_content_getter();
      this.editor_store.set_markdown(
        this.active_note.meta.id,
        as_markdown_text(markdown),
      );
    } else if (this.session && mode === "visual") {
      const markdown = this.session.get_markdown();
      this.editor_store.set_markdown(
        this.active_note.meta.id,
        as_markdown_text(markdown),
      );
    }

    const open_note = this.editor_store.open_note;
    if (!open_note) return null;

    const normalized_markdown = as_markdown_text(
      normalize_markdown_line_breaks(open_note.markdown),
    );
    if (normalized_markdown !== open_note.markdown) {
      this.editor_store.set_markdown(open_note.meta.id, normalized_markdown);
    }

    return {
      note_id: this.active_note.meta.id,
      markdown: normalized_markdown,
    };
  }

  get_scroll_top(): number {
    return this.host_root?.parentElement?.scrollTop ?? 0;
  }

  set_scroll_top(value: number) {
    const container = this.host_root?.parentElement;
    if (!container || value <= 0) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container.scrollTop = value;
      });
    });
  }

  focus() {
    this.session?.focus();
  }

  scroll_cursor_into_view() {
    this.session?.scroll_cursor_into_view?.();
  }

  trigger_hover_at_cursor(): void {
    this.session?.trigger_hover_at_cursor?.();
  }

  close_buffer(note_path: NotePath) {
    this.session?.close_buffer(note_path);
  }

  update_find_state(query: string, selected_index: number): number {
    return this.session?.update_find_state?.(query, selected_index) ?? 0;
  }

  replace_at_match(match_index: number, replacement: string) {
    this.session?.replace_at_match?.(match_index, replacement);
  }

  replace_all_matches(replacement: string) {
    this.session?.replace_all_matches?.(replacement);
  }

  get_markdown(): string {
    return this.session?.get_markdown() ?? "";
  }

  get_cursor_markdown_offset(): number {
    return this.session?.get_cursor_markdown_offset?.() ?? 0;
  }

  set_cursor_from_markdown_offset(offset: number) {
    this.session?.set_cursor_from_markdown_offset?.(offset);
  }

  scroll_to_position(pos: number) {
    this.session?.scroll_to_position?.(pos);
  }

  set_editable(editable: boolean) {
    this.session?.set_editable?.(editable);
  }

  set_spellcheck(enabled: boolean) {
    this.session?.set_spellcheck?.(enabled);
  }

  async set_native_feature_flags(flags: {
    native_link_hover_enabled: boolean;
    native_wiki_suggest_enabled: boolean;
    native_link_click_enabled: boolean;
  }) {
    const changed =
      this.native_link_hover_enabled !== flags.native_link_hover_enabled ||
      this.native_wiki_suggest_enabled !== flags.native_wiki_suggest_enabled ||
      this.native_link_click_enabled !== flags.native_link_click_enabled;

    this.native_link_hover_enabled = flags.native_link_hover_enabled;
    this.native_wiki_suggest_enabled = flags.native_wiki_suggest_enabled;
    this.native_link_click_enabled = flags.native_link_click_enabled;

    if (changed && this.is_mounted()) {
      await this.recreate_session();
    }
  }

  update_visual_editor_diagnostics(diagnostics: Diagnostic[]) {
    this.session?.update_diagnostics?.(diagnostics);
  }

  toggle_heading_fold(pos?: number) {
    this.session?.toggle_heading_fold?.(pos);
  }

  collapse_all_heading_folds() {
    this.session?.collapse_all_heading_folds?.();
  }

  expand_all_heading_folds() {
    this.session?.expand_all_heading_folds?.();
  }

  turn_into(target: string, attrs?: Record<string, unknown>) {
    this.session?.turn_into?.(target, attrs);
  }

  duplicate_block() {
    this.session?.duplicate_block?.();
  }

  delete_block() {
    this.session?.delete_block?.();
  }

  batch_turn_into(
    target: string,
    attrs: Record<string, unknown> | undefined,
    positions: Set<number>,
  ) {
    this.session?.batch_turn_into?.(target, attrs, positions);
  }

  batch_duplicate(positions: Set<number>) {
    this.session?.batch_duplicate?.(positions);
  }

  batch_delete(positions: Set<number>) {
    this.session?.batch_delete?.(positions);
  }

  get_block_selection(): Set<number> {
    return this.session?.get_block_selection?.() ?? new Set();
  }

  clear_block_selection() {
    this.session?.clear_block_selection?.();
  }

  update_task_checkbox(
    line_number: number,
    status: "todo" | "doing" | "done",
  ): boolean {
    return this.session?.update_task_checkbox?.(line_number, status) ?? false;
  }

  set_toolbar_visibility(mode: ToolbarVisibility) {
    this.session?.set_toolbar_visibility?.(mode);
  }

  private resolve_visual_selection(): EditorSelectionSnapshot | null {
    const text = this.session?.get_selected_text?.();
    if (!text || text.trim() === "") return null;
    return {
      text,
      start: null,
      end: null,
    };
  }

  private next_session_generation(): number {
    this.session_generation += 1;
    return this.session_generation;
  }

  private invalidate_session_generation() {
    this.session_generation += 1;
  }

  private is_generation_current(generation: number): boolean {
    return generation === this.session_generation;
  }

  private get_active_note_id(): NoteId | null {
    return this.active_note?.meta.id ?? null;
  }

  private get_active_note_path(): NotePath | null {
    return this.active_note?.meta.path ?? null;
  }

  private with_active_note_id(
    generation: number,
    fn: (id: NoteId) => void,
  ): void {
    if (!this.is_generation_current(generation)) return;
    const id = this.get_active_note_id();
    if (!id) return;
    fn(id);
  }

  private with_active_note_identity(
    generation: number,
    fn: (id: NoteId, path: NotePath) => void,
  ): void {
    if (!this.is_generation_current(generation)) return;
    const id = this.get_active_note_id();
    const path = this.get_active_note_path();
    if (!id || !path) return;
    fn(id, path);
  }

  private map_wiki_suggestions(
    results: Awaited<
      ReturnType<
        NonNullable<EditorService["search_service"]>["suggest_wiki_links"]
      >
    >["results"],
  ) {
    return results.map((result_item) => {
      if (result_item.kind === "planned") {
        return {
          kind: "planned" as const,
          title: note_name_from_path(result_item.target_path),
          path: result_item.target_path,
          ref_count: result_item.ref_count,
        };
      }
      return {
        kind: "existing" as const,
        title: result_item.note.name,
        path: result_item.note.path,
      };
    });
  }

  private handle_wiki_suggest_query(
    generation: number,
    event: WikiQueryEvent,
  ): void {
    if (!this.is_generation_current(generation)) return;
    const search_service = this.search_service;
    if (!search_service) return;

    if (event.kind === "note") {
      void search_service.suggest_wiki_links(event.query).then((result) => {
        if (!this.is_generation_current(generation)) return;
        if (result.status === "stale") return;
        if (result.status !== "success") {
          this.session?.set_wiki_suggestions?.([]);
          return;
        }

        this.session?.set_wiki_suggestions?.(
          this.map_wiki_suggestions(result.results),
        );
      });
    } else {
      void this.handle_heading_suggest(
        generation,
        event.note_name,
        event.heading_query,
      );
    }
  }

  private async handle_heading_suggest(
    generation: number,
    note_name: string | null,
    heading_query: string,
  ): Promise<void> {
    const search_service = this.search_service;
    if (!search_service) return;

    const vault_id = this.vault_store.active_vault_id;
    if (!vault_id) return;

    let resolved_path: string | null = null;

    if (note_name === null) {
      resolved_path = this.get_active_note_path();
    } else {
      const source_path = this.get_active_note_path();
      if (!source_path) return;
      resolved_path = await search_service.resolve_wiki_link(
        source_path,
        note_name,
      );
    }

    if (!resolved_path) {
      this.session?.set_heading_suggestions?.([]);
      return;
    }
    if (!this.is_generation_current(generation)) return;

    const headings = await search_service.get_note_headings(
      vault_id,
      resolved_path,
    );
    if (!this.is_generation_current(generation)) return;

    const query_lower = heading_query.toLowerCase();
    const filtered = headings.filter((h) =>
      h.text.toLowerCase().includes(query_lower),
    );

    this.session?.set_heading_suggestions?.(filtered);
  }

  private handle_image_suggest_query(generation: number, query: string): void {
    if (!this.is_generation_current(generation)) return;
    const assets_port = this.assets_port;
    if (!assets_port) return;
    const vault_id = this.vault_store.active_vault_id;
    if (!vault_id) return;

    void assets_port.search_assets(vault_id, query, 20).then((paths) => {
      if (!this.is_generation_current(generation)) return;
      this.session?.set_image_suggestions?.(
        paths.map((p) => ({
          path: p,
          name: p.split("/").at(-1) ?? p,
        })),
      );
    });
  }

  private handle_tag_suggest_query(generation: number, query: string): void {
    if (!this.is_generation_current(generation)) return;
    const tag_port = this.tag_port;
    if (!tag_port) return;
    const vault_id = this.vault_store.active_vault_id;
    if (!vault_id) return;

    void tag_port.list_all_tags(vault_id).then((tags) => {
      if (!this.is_generation_current(generation)) return;
      const lower_query = query.toLowerCase();
      const filtered = tags.filter((t) =>
        t.tag.toLowerCase().startsWith(lower_query),
      );
      this.session?.set_tag_suggestions?.(filtered);
    });
  }

  private handle_cite_suggest_query(query: string): void {
    const reference_store = this.reference_store;
    if (!reference_store) return;

    const all = reference_store.library_items;
    const items: CiteSuggestionItem[] = [];
    for (const item of all) {
      if (query && !match_query(item, query)) continue;
      items.push({
        citekey: item.id,
        title: item.title ?? "",
        authors: format_authors(item.author),
        year: String(extract_year(item) ?? ""),
      });
      if (items.length >= 20) break;
    }

    this.session?.set_cite_suggestions?.(items);
  }

  private handle_cite_accept(citekey: string): void {
    const reference_store = this.reference_store;
    if (!reference_store) return;

    const item = reference_store.library_items.find((i) => i.id === citekey);
    if (!item) return;

    const markdown = this.get_markdown();
    if (!markdown) return;

    const updated = sync_reference_to_markdown(markdown, item);
    if (updated !== markdown) {
      this.sync_visual_from_markdown(updated);
    }
  }

  private handle_at_palette_note_query(
    generation: number,
    query: string,
  ): void {
    if (!this.is_generation_current(generation)) return;
    const search_service = this.search_service;
    if (!search_service) return;

    void search_service.suggest_wiki_links(query).then((result) => {
      if (!this.is_generation_current(generation)) return;
      if (result.status === "stale" || result.status !== "success") {
        this.session?.set_at_palette_suggestions?.("notes", []);
        return;
      }
      const items: AtPaletteItem[] = this.map_wiki_suggestions(
        result.results,
      ).map((r) => ({
        category: "notes" as const,
        title: r.title,
        path: r.path,
        kind: r.kind,
        ref_count: r.ref_count,
      }));
      this.session?.set_at_palette_suggestions?.("notes", items);
    });
  }

  private handle_at_palette_heading_query(
    generation: number,
    note_name: string | null,
    heading_query: string,
  ): void {
    if (!this.is_generation_current(generation)) return;
    const search_service = this.search_service;
    if (!search_service) return;
    const vault_id = this.vault_store.active_vault_id;
    if (!vault_id) return;

    const resolve_path = async (): Promise<string | null> => {
      if (note_name === null) return this.get_active_note_path();
      const source_path = this.get_active_note_path();
      if (!source_path) return null;
      return search_service.resolve_wiki_link(source_path, note_name);
    };

    void resolve_path().then(async (resolved_path) => {
      if (!resolved_path || !this.is_generation_current(generation)) {
        this.session?.set_at_palette_suggestions?.("headings", []);
        return;
      }
      const headings = await search_service.get_note_headings(
        vault_id,
        resolved_path,
      );
      if (!this.is_generation_current(generation)) return;

      const query_lower = heading_query.toLowerCase();
      const note_path = resolved_path;
      const items: AtPaletteItem[] = headings
        .filter((h) => h.text.toLowerCase().includes(query_lower))
        .map((h) => ({
          category: "headings" as const,
          text: h.text,
          level: h.level,
          note_path,
        }));
      this.session?.set_at_palette_suggestions?.("headings", items);
    });
  }

  private handle_at_palette_tag_query(generation: number, query: string): void {
    if (!this.is_generation_current(generation)) return;
    const tag_port = this.tag_port;
    if (!tag_port) return;
    const vault_id = this.vault_store.active_vault_id;
    if (!vault_id) return;

    void tag_port.list_all_tags(vault_id).then((tags) => {
      if (!this.is_generation_current(generation)) return;
      const lower_query = query.toLowerCase();
      const items: AtPaletteItem[] = tags
        .filter((t) => t.tag.toLowerCase().startsWith(lower_query))
        .map((t) => ({
          category: "tags" as const,
          tag: t.tag,
          count: t.count,
        }));
      this.session?.set_at_palette_suggestions?.("tags", items);
    });
  }

  private handle_at_palette_cite_query(query: string): void {
    const reference_store = this.reference_store;
    if (!reference_store) return;

    const all = reference_store.library_items;
    const items: AtPaletteItem[] = [];
    for (const item of all) {
      if (query && !match_query(item, query)) continue;
      items.push({
        category: "references" as const,
        citekey: item.id,
        title: item.title ?? "",
        authors: format_authors(item.author),
        year: String(extract_year(item) ?? ""),
      });
      if (items.length >= 20) break;
    }
    this.session?.set_at_palette_suggestions?.("references", items);
  }

  private create_session_events(generation: number): EditorSessionEvents {
    const events: EditorSessionEvents = {
      on_markdown_change: (markdown: string) => {
        this.with_active_note_id(generation, (id) => {
          this.editor_store.set_markdown(id, as_markdown_text(markdown));
        });
      },
      on_dirty_state_change: (is_dirty: boolean) => {
        this.with_active_note_identity(generation, (id, path) => {
          this.editor_store.set_dirty(id, is_draft_note_path(path) || is_dirty);
        });
      },
      on_cursor_change: (cursor: CursorInfo) => {
        this.with_active_note_id(generation, (id) => {
          this.editor_store.set_cursor(id, cursor);
        });
      },
      on_selection_change: (selection: EditorSelectionSnapshot | null) => {
        this.with_active_note_id(generation, (id) => {
          this.editor_store.set_selection(id, selection);
        });
      },
      on_internal_link_click: (
        raw_path: string,
        base_note_path: string,
        source: InternalLinkSource,
      ) => {
        if (!this.is_generation_current(generation)) return;
        this.callbacks.on_internal_link_click(raw_path, base_note_path, source);
      },
      on_external_link_click: (url: string) => {
        if (!this.is_generation_current(generation)) return;
        this.callbacks.on_external_link_click(url);
      },
      on_anchor_link_click: this.callbacks.on_anchor_link_click
        ? (fragment: string) => {
            if (!this.is_generation_current(generation)) return;
            this.callbacks.on_anchor_link_click?.(fragment);
          }
        : undefined,
      on_image_paste_requested: (image: PastedImagePayload) => {
        this.with_active_note_identity(generation, (id, path) => {
          this.callbacks.on_image_paste_requested(id, path, image);
        });
      },
      on_file_drop_requested: (file: PastedImagePayload) => {
        this.with_active_note_identity(generation, (id, path) => {
          this.callbacks.on_file_drop_requested(id, path, file);
        });
      },
    };

    if (this.search_service) {
      events.on_wiki_suggest_query = (event: WikiQueryEvent) => {
        this.handle_wiki_suggest_query(generation, event);
      };
    }

    if (this.assets_port) {
      events.on_image_suggest_query = (query: string) => {
        this.handle_image_suggest_query(generation, query);
      };
    }

    if (this.tag_port) {
      events.on_tag_suggest_query = (query: string) => {
        this.handle_tag_suggest_query(generation, query);
      };
    }

    if (this.reference_store) {
      events.on_cite_suggest_query = (query: string) => {
        this.handle_cite_suggest_query(query);
      };
      events.on_cite_accept = (citekey: string) => {
        this.handle_cite_accept(citekey);
      };
    }

    if (this.search_service || this.tag_port || this.reference_store) {
      events.on_at_palette_note_query = (query: string) => {
        this.handle_at_palette_note_query(generation, query);
      };
      events.on_at_palette_heading_query = (
        note_name: string | null,
        heading_query: string,
      ) => {
        this.handle_at_palette_heading_query(
          generation,
          note_name,
          heading_query,
        );
      };
      events.on_at_palette_tag_query = (query: string) => {
        this.handle_at_palette_tag_query(generation, query);
      };
      events.on_at_palette_cite_query = (query: string) => {
        this.handle_at_palette_cite_query(query);
      };
      events.on_at_palette_command_execute = (command_id: string) => {
        this.callbacks.on_command_execute?.(command_id);
      };
    }

    if (this.outline_store) {
      const outline_store = this.outline_store;
      events.on_outline_change = (headings) => {
        if (!this.is_generation_current(generation)) return;
        const note_path = this.get_active_note_path();
        outline_store.set_headings(headings, note_path ?? undefined);

        const fragment = this.editor_store.pending_heading_fragment;
        if (fragment) {
          this.editor_store.set_pending_heading_fragment(null);
          const heading = outline_store.find_heading_by_fragment(fragment);
          if (heading) {
            this.scroll_to_position(heading.pos);
          }
        }
      };
    }

    if (this.callbacks.on_markdown_lsp_hover) {
      const hover_cb = this.callbacks.on_markdown_lsp_hover;
      events.on_markdown_lsp_hover = (line: number, character: number) => {
        const note = this.active_note;
        if (
          !note ||
          !this.is_generation_current(generation) ||
          is_draft_note_path(note.meta.path)
        ) {
          return Promise.resolve(null);
        }
        return hover_cb(note.meta.path, line, character);
      };
    }

    if (this.callbacks.on_markdown_lsp_hover_result) {
      events.on_markdown_lsp_hover_result =
        this.callbacks.on_markdown_lsp_hover_result;
    }

    if (this.callbacks.on_markdown_lsp_definition) {
      const def_cb = this.callbacks.on_markdown_lsp_definition;
      events.on_markdown_lsp_definition = (line: number, character: number) => {
        const note = this.active_note;
        if (
          !note ||
          !this.is_generation_current(generation) ||
          is_draft_note_path(note.meta.path)
        ) {
          return Promise.resolve([]);
        }
        return def_cb(note.meta.path, line, character);
      };
    }

    if (this.callbacks.on_markdown_lsp_definition_navigate) {
      events.on_markdown_lsp_definition_navigate =
        this.callbacks.on_markdown_lsp_definition_navigate;
    }

    if (this.callbacks.on_markdown_lsp_completion) {
      const completion_cb = this.callbacks.on_markdown_lsp_completion;
      events.on_markdown_lsp_completion = (line: number, character: number) => {
        const note = this.active_note;
        if (
          !note ||
          !this.is_generation_current(generation) ||
          is_draft_note_path(note.meta.path)
        ) {
          return Promise.resolve([]);
        }
        return completion_cb(note.meta.path, line, character);
      };
    }

    if (this.callbacks.get_markdown_lsp_completion_trigger_characters) {
      events.get_markdown_lsp_completion_trigger_characters =
        this.callbacks.get_markdown_lsp_completion_trigger_characters;
    }

    if (this.callbacks.on_markdown_lsp_inlay_hints) {
      const hints_cb = this.callbacks.on_markdown_lsp_inlay_hints;
      events.on_markdown_lsp_inlay_hints = () => {
        const note = this.active_note;
        if (
          !note ||
          !this.is_generation_current(generation) ||
          is_draft_note_path(note.meta.path)
        ) {
          return Promise.resolve([]);
        }
        return hints_cb(note.meta.path);
      };
    }

    if (this.callbacks.on_markdown_lsp_code_actions) {
      const code_actions_cb = this.callbacks.on_markdown_lsp_code_actions;
      events.on_markdown_lsp_code_actions = (
        start_line,
        start_character,
        end_line,
        end_character,
      ) => {
        const note = this.active_note;
        if (
          !note ||
          !this.is_generation_current(generation) ||
          is_draft_note_path(note.meta.path)
        ) {
          return Promise.resolve([]);
        }
        return code_actions_cb(
          note.meta.path,
          start_line,
          start_character,
          end_line,
          end_character,
        );
      };
    }

    if (this.callbacks.on_markdown_lsp_code_action_resolve) {
      events.on_markdown_lsp_code_action_resolve =
        this.callbacks.on_markdown_lsp_code_action_resolve;
    }

    if (this.callbacks.on_lsp_code_actions) {
      const lsp_code_actions_cb = this.callbacks.on_lsp_code_actions;
      events.on_lsp_code_actions = (
        start_line,
        start_character,
        end_line,
        end_character,
      ) => {
        const note = this.active_note;
        if (
          !note ||
          !this.is_generation_current(generation) ||
          is_draft_note_path(note.meta.path)
        ) {
          return Promise.resolve([]);
        }
        return lsp_code_actions_cb(
          note.meta.path,
          start_line,
          start_character,
          end_line,
          end_character,
        );
      };
    }

    if (this.callbacks.on_lsp_code_action_resolve) {
      events.on_lsp_code_action_resolve =
        this.callbacks.on_lsp_code_action_resolve;
    }

    return events;
  }

  private async recreate_session(): Promise<void> {
    const host_root = this.host_root;
    const active_note = this.active_note;
    if (!host_root || !active_note) return;

    const generation = this.next_session_generation();

    this.teardown_session();
    if (typeof host_root.replaceChildren === "function") {
      host_root.replaceChildren();
    }

    const next_session = await this.editor_port.start_session({
      root: host_root,
      initial_markdown: active_note.markdown,
      note_path: active_note.meta.path,
      vault_id: this.vault_store.vault?.id ?? null,
      events: this.create_session_events(generation),
      native_link_hover_enabled: this.native_link_hover_enabled,
      native_wiki_suggest_enabled: this.native_wiki_suggest_enabled,
      native_link_click_enabled: this.native_link_click_enabled,
    });

    if (!this.is_generation_current(generation)) {
      this.destroy_session_instance(next_session);
      return;
    }

    this.session = next_session;
  }

  private teardown_session() {
    const current = this.session;
    if (!current) return;
    this.session = null;
    this.destroy_session_instance(current);
  }

  private destroy_session_instance(session: EditorSession) {
    try {
      session.destroy();
    } catch (error) {
      log.error("Editor teardown failed", { error });
    }
  }
}
