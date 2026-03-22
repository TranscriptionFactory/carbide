import type { VaultId } from "$lib/shared/types/ids";
import type {
  CursorInfo,
  PastedImagePayload,
  EditorSelectionSnapshot,
} from "$lib/shared/types/editor";
import type { OutlineHeading } from "$lib/features/outline";

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
  get_markdown: () => string;
  insert_text_at_cursor: (text: string) => void;
  replace_selection?: (text: string) => void;
  get_selected_text?: () => string | null;
  mark_clean: () => void;
  is_dirty: () => boolean;
  focus: () => void;
  set_wiki_suggestions?: (
    items: Array<{
      title: string;
      path: string;
      kind: "existing" | "planned";
      ref_count?: number | undefined;
    }>,
  ) => void;
  set_image_suggestions?: (
    items: Array<{ path: string; name: string }>,
  ) => void;
  open_buffer: (config: BufferConfig) => void;
  rename_buffer: (old_note_path: string, new_note_path: string) => void;
  close_buffer: (note_path: string) => void;
  update_find_state?: (query: string, selected_index: number) => void;
  replace_at_match?: (match_index: number, replacement: string) => void;
  replace_all_matches?: (replacement: string) => void;
  scroll_to_position?: (pos: number) => void;
  get_cursor_markdown_offset?: () => number;
  set_cursor_from_markdown_offset?: (offset: number) => void;
  set_editable?: (editable: boolean) => void;
  toggle_heading_fold?: (pos?: number) => void;
  collapse_all_heading_folds?: () => void;
  expand_all_heading_folds?: () => void;
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
  on_image_paste_requested?: (payload: PastedImagePayload) => void;
  on_file_drop_requested?: (payload: PastedImagePayload) => void;
  on_wiki_suggest_query?: (query: string) => void;
  on_image_suggest_query?: (query: string) => void;
  on_outline_change?: (headings: OutlineHeading[]) => void;
  on_iwe_hover?: (
    line: number,
    character: number,
  ) => Promise<{ contents: string | null } | null>;
  on_iwe_definition?: (
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
  on_iwe_definition_navigate?: (uri: string) => void;
};

export type EditorSessionConfig = {
  root: HTMLElement;
  initial_markdown: string;
  note_path: string;
  vault_id: VaultId | null;
  events: EditorEventHandlers;
};

export interface EditorPort {
  start_session: (config: EditorSessionConfig) => Promise<EditorSession>;
}
