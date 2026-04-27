import type { VaultId } from "$lib/shared/types/ids";
import type {
  CursorInfo,
  PastedImagePayload,
  EditorSelectionSnapshot,
} from "$lib/shared/types/editor";
import type { OutlineHeading } from "$lib/features/outline";
import type { CiteSuggestionItem } from "$lib/features/editor/adapters/cite_suggest_plugin";
import type {
  AtPaletteCategory,
  AtPaletteItem,
} from "$lib/features/editor/adapters/at_palette_types";
import type { ToolbarVisibility } from "$lib/shared/types/editor_settings";
import type { Diagnostic } from "$lib/features/diagnostics";

export type WikiQueryEvent =
  | { kind: "note"; query: string }
  | { kind: "heading"; note_name: string | null; heading_query: string }
  | { kind: "block"; note_name: string | null; block_query: string };

export type BufferConfig = {
  note_path: string;
  vault_id: VaultId | null;
  initial_markdown: string;
  restore_policy: BufferRestorePolicy;
};

export type BufferRestorePolicy = "reuse_cache" | "fresh";
export type InternalLinkSource = "markdown" | "wiki";

export type EditorSession = {
  destroy: () => void;
  set_markdown: (markdown: string) => void;
  apply_markdown_diff?: (new_markdown: string) => boolean;
  replace_doc_undoable?: (markdown: string) => void;
  get_markdown: () => string;
  insert_text_at_cursor: (text: string) => void;
  replace_selection?: (text: string) => void;
  get_selected_text?: () => string | null;
  mark_clean: (saved_content?: string) => void;
  is_dirty: () => boolean;
  focus: () => void;
  scroll_cursor_into_view?: () => void;
  set_wiki_suggestions?: (
    items: Array<{
      title: string;
      path: string;
      kind: "existing" | "planned";
      ref_count?: number | undefined;
    }>,
  ) => void;
  set_heading_suggestions?: (
    items: Array<{ text: string; level: number }>,
  ) => void;
  set_image_suggestions?: (
    items: Array<{ path: string; name: string }>,
  ) => void;
  set_tag_suggestions?: (items: Array<{ tag: string; count: number }>) => void;
  set_cite_suggestions?: (items: CiteSuggestionItem[]) => void;
  set_at_palette_suggestions?: (
    category: AtPaletteCategory,
    items: AtPaletteItem[],
  ) => void;
  open_buffer: (config: BufferConfig) => void;
  rename_buffer: (old_note_path: string, new_note_path: string) => void;
  close_buffer: (note_path: string) => void;
  update_find_state?: (query: string, selected_index: number) => number;
  replace_at_match?: (match_index: number, replacement: string) => void;
  replace_all_matches?: (replacement: string) => void;
  scroll_to_position?: (pos: number) => void;
  get_cursor_markdown_offset?: () => number;
  set_cursor_from_markdown_offset?: (offset: number) => void;
  set_editable?: (editable: boolean) => void;
  set_spellcheck?: (enabled: boolean) => void;
  toggle_heading_fold?: (pos?: number) => void;
  collapse_all_heading_folds?: () => void;
  expand_all_heading_folds?: () => void;
  update_task_checkbox?: (
    line_number: number,
    status: "todo" | "doing" | "done",
  ) => boolean;
  set_toolbar_visibility?: (mode: ToolbarVisibility) => void;
  trigger_hover_at_cursor?: () => void;
  update_diagnostics?: (diagnostics: Diagnostic[]) => void;
  get_view?: () => import("prosemirror-view").EditorView | null;
  turn_into?: (target: string, attrs?: Record<string, unknown>) => void;
  duplicate_block?: () => void;
  delete_block?: () => void;
  batch_turn_into?: (
    target: string,
    attrs: Record<string, unknown> | undefined,
    positions: Set<number>,
  ) => void;
  batch_duplicate?: (positions: Set<number>) => void;
  batch_delete?: (positions: Set<number>) => void;
  get_block_selection?: () => Set<number>;
  clear_block_selection?: () => void;
};

export type EditorEventHandlers = {
  on_markdown_change: (markdown: string) => void;
  on_dirty_state_change: (is_dirty: boolean) => void;
  on_cursor_change?: (info: CursorInfo) => void;
  on_selection_change?: (selection: EditorSelectionSnapshot | null) => void;
  on_internal_link_click?: (
    raw_path: string,
    base_note_path: string,
    source: InternalLinkSource,
  ) => void;
  on_external_link_click?: (url: string) => void;
  on_anchor_link_click?: ((fragment: string) => void) | undefined;
  on_image_paste_requested?: (payload: PastedImagePayload) => void;
  on_file_drop_requested?: (payload: PastedImagePayload) => void;
  on_wiki_suggest_query?: (event: WikiQueryEvent) => void;
  on_image_suggest_query?: (query: string) => void;
  on_tag_suggest_query?: (query: string) => void;
  on_cite_suggest_query?: (query: string) => void;
  on_cite_accept?: (citekey: string) => void;
  on_at_palette_note_query?: (query: string) => void;
  on_at_palette_heading_query?: (
    note_name: string | null,
    heading_query: string,
  ) => void;
  on_at_palette_tag_query?: (query: string) => void;
  on_at_palette_cite_query?: (query: string) => void;
  on_at_palette_command_execute?: (command_id: string) => void;
  on_outline_change?: (headings: OutlineHeading[]) => void;
  on_markdown_lsp_hover?: (
    line: number,
    character: number,
  ) => Promise<{ contents: string | null } | null>;
  on_markdown_lsp_hover_result?: (
    result: { contents: string; line: number; character: number } | null,
  ) => void;
  on_markdown_lsp_definition?: (
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
    line: number,
    character: number,
  ) => Promise<
    Array<{ label: string; detail: string | null; insert_text: string | null }>
  >;
  get_markdown_lsp_completion_trigger_characters?: () => string[];
  on_markdown_lsp_inlay_hints?: () => Promise<
    Array<{
      position_line: number;
      position_character: number;
      label: string;
    }>
  >;
  on_markdown_lsp_code_actions?: (
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

export type EditorSessionConfig = {
  root: HTMLElement;
  initial_markdown: string;
  note_path: string;
  vault_id: VaultId | null;
  events: EditorEventHandlers;
  spellcheck?: boolean;
  native_link_hover_enabled?: boolean;
  native_wiki_suggest_enabled?: boolean;
  native_link_click_enabled?: boolean;
};

export interface EditorPort {
  start_session: (config: EditorSessionConfig) => Promise<EditorSession>;
}
