import type {
  OpenNoteState,
  CursorInfo,
  EditorSelectionSnapshot,
} from "$lib/shared/types/editor";
import type { NoteId, NotePath } from "$lib/shared/types/ids";
import { note_name_from_path } from "$lib/shared/utils/path";
import type { EditorMode } from "$lib/shared/types/editor";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.1;

export class EditorStore {
  open_note = $state<OpenNoteState | null>(null);
  cursor = $state<CursorInfo | null>(null);
  last_saved_at = $state<number | null>(null);
  session_revision = $state(0);
  editor_mode = $state<EditorMode>("visual");
  split_view = $state(false);
  cursor_offset = $state(0);
  scroll_fraction = $state(0);
  selection = $state<EditorSelectionSnapshot | null>(null);
  source_content_getter: (() => string) | null = null;
  cm_content_cache: Map<string, { doc: string; cursor_offset: number }> =
    new Map();
  zoom = $state(1.0);

  cache_cm_content(note_path: string, doc: string, cursor_offset: number) {
    this.cm_content_cache.set(note_path, { doc, cursor_offset });
  }

  get_cm_content_cache(note_path: string) {
    return this.cm_content_cache.get(note_path) ?? null;
  }

  clear_cm_content_cache(note_path: string) {
    this.cm_content_cache.delete(note_path);
  }

  set_source_content_getter(fn: () => string) {
    this.source_content_getter = fn;
  }

  clear_source_content_getter() {
    this.source_content_getter = null;
  }

  set_open_note(open_note: OpenNoteState) {
    this.open_note = open_note;
    this.cursor = null;
    this.last_saved_at = open_note.meta.mtime_ms || null;
    this.selection = null;
    this.cursor_offset = 0;
    this.scroll_fraction = 0;
  }

  clear_open_note() {
    this.open_note = null;
    this.cursor = null;
    this.last_saved_at = null;
    this.selection = null;
  }

  set_markdown(note_id: NoteId, markdown: OpenNoteState["markdown"]) {
    if (!this.open_note) return;
    if (this.open_note.meta.id !== note_id) return;
    this.open_note = {
      ...this.open_note,
      markdown,
    };
  }

  set_dirty(note_id: NoteId, is_dirty: boolean) {
    if (!this.open_note) return;
    if (this.open_note.meta.id !== note_id) return;
    this.open_note = {
      ...this.open_note,
      is_dirty,
    };
  }

  mark_clean(note_id: NoteId, saved_at_ms?: number) {
    if (!this.open_note) return;
    if (this.open_note.meta.id !== note_id) return;
    this.open_note = {
      ...this.open_note,
      is_dirty: false,
      ...(saved_at_ms !== undefined && {
        meta: { ...this.open_note.meta, mtime_ms: saved_at_ms },
      }),
    };
    if (saved_at_ms !== undefined) {
      this.last_saved_at = saved_at_ms;
    }
  }

  update_mtime(note_id: NoteId, mtime_ms: number) {
    if (!this.open_note) return;
    if (this.open_note.meta.id !== note_id) return;
    this.open_note = {
      ...this.open_note,
      meta: { ...this.open_note.meta, mtime_ms },
    };
  }

  update_open_note_path(new_path: NotePath) {
    if (!this.open_note) return;
    const name = note_name_from_path(new_path);
    this.open_note = {
      ...this.open_note,
      meta: {
        ...this.open_note.meta,
        id: new_path,
        path: new_path,
        name,
        title: name,
      },
    };
  }

  update_open_note_path_prefix(old_prefix: string, new_prefix: string) {
    if (!this.open_note) return;
    const current_path = this.open_note.meta.path;
    if (!current_path.startsWith(old_prefix)) return;

    const new_path =
      `${new_prefix}${current_path.slice(old_prefix.length)}` as NotePath;
    const name = note_name_from_path(new_path);
    this.open_note = {
      ...this.open_note,
      meta: {
        ...this.open_note.meta,
        id: new_path,
        path: new_path,
        name,
        title: name,
      },
    };
  }

  set_cursor(note_id: NoteId, cursor: CursorInfo | null) {
    if (!this.open_note) return;
    if (this.open_note.meta.id !== note_id) return;
    this.cursor = cursor;
  }

  set_selection(note_id: NoteId, selection: EditorSelectionSnapshot | null) {
    if (!this.open_note) return;
    if (this.open_note.meta.id !== note_id) return;
    this.selection = selection;
  }

  set_editor_mode(mode: EditorMode) {
    if (this.editor_mode === mode) return;
    this.editor_mode = mode;
  }

  toggle_editor_mode() {
    const cycle: Record<EditorMode, EditorMode> = {
      visual: "source",
      source: "visual",
      read_only: "visual",
    };
    this.editor_mode = cycle[this.editor_mode];
  }

  toggle_split_view() {
    this.split_view = !this.split_view;
  }

  set_split_view(enabled: boolean) {
    this.split_view = enabled;
  }

  set_cursor_offset(offset: number) {
    this.cursor_offset = offset;
  }

  set_scroll_fraction(fraction: number) {
    this.scroll_fraction = fraction;
  }

  zoom_in() {
    this.zoom = Math.min(
      ZOOM_MAX,
      Math.round((this.zoom + ZOOM_STEP) * 10) / 10,
    );
  }

  zoom_out() {
    this.zoom = Math.max(
      ZOOM_MIN,
      Math.round((this.zoom - ZOOM_STEP) * 10) / 10,
    );
  }

  zoom_reset() {
    this.zoom = 1.0;
  }

  get zoom_percent(): number {
    return Math.round(this.zoom * 100);
  }

  reset() {
    this.open_note = null;
    this.cursor = null;
    this.last_saved_at = null;
    this.editor_mode = "visual";
    this.split_view = false;
    this.cursor_offset = 0;
    this.scroll_fraction = 0;
    this.selection = null;
  }
}
