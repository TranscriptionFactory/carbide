import type { NotePath } from "$lib/shared/types/ids";
import type { CursorInfo, OpenNoteState } from "$lib/shared/types/editor";

export type TabId = string;
export type Pane = "primary" | "secondary";

export type Tab = {
  id: TabId;
  title: string;
  is_pinned: boolean;
  is_dirty: boolean;
  pane: Pane;
} & (
  | { kind: "note"; note_path: NotePath }
  | { kind: "document"; file_path: string; file_type: string }
  | { kind: "graph"; view_mode: "vault" }
  | { kind: "search_graph"; query: string }
);

export type TabEditorSnapshot = {
  scroll_top: number;
  cursor: CursorInfo | null;
  cursor_offset: number;
  markdown_cursor_offset: number;
};

export type ClosedTabEntry = {
  title: string;
  scroll_top: number;
  cursor: CursorInfo | null;
  draft_note: OpenNoteState | null;
} & (
  | { kind: "note"; note_path: NotePath }
  | { kind: "document"; file_path: string; file_type: string }
);

export type PersistedTab = {
  is_pinned: boolean;
  cursor: CursorInfo | null;
  pane?: Pane;
} & (
  | { kind: "note"; note_path: NotePath }
  | { kind: "document"; file_path: string; file_type: string }
  | { kind: "graph"; view_mode: "vault" }
  | { kind: "search_graph"; query: string }
);

export type PersistedTabState = {
  tabs: PersistedTab[];
  active_tab_path: string | null;
  active_pane?: Pane;
};
