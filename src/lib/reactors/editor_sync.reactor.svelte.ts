import type { EditorStore } from "$lib/features/editor";
import type { EditorService } from "$lib/features/editor";
import type { BufferRestorePolicy } from "$lib/features/editor";
import type { PendingCursorRestore } from "$lib/features/editor";

export function resolve_editor_sync_cursor_offset(
  pending: PendingCursorRestore | null,
): number | undefined {
  if (pending && pending.markdown_cursor_offset >= 0) {
    return pending.markdown_cursor_offset;
  }
  return undefined;
}

export function resolve_editor_sync_scroll_top(
  pending: PendingCursorRestore | null,
): number | undefined {
  if (pending && pending.scroll_top >= 0) {
    return pending.scroll_top;
  }
  return undefined;
}

export function resolve_editor_sync_open(input: {
  open_note_id: string;
  open_note_buffer_id: string;
  last_note_id: string | null;
  last_buffer_id: string | null;
}): boolean {
  return (
    input.open_note_id !== input.last_note_id ||
    input.open_note_buffer_id !== input.last_buffer_id
  );
}

export function resolve_editor_sync_restore_policy(input: {
  open_note_id: string;
  last_note_id: string | null;
}): BufferRestorePolicy {
  if (input.open_note_id !== input.last_note_id) {
    return "reuse_cache";
  }
  return "fresh";
}

export function create_editor_sync_reactor(
  editor_store: EditorStore,
  editor_service: EditorService,
): () => void {
  let last_note_id: string | null = null;
  let last_buffer_id: string | null = null;

  return $effect.root(() => {
    $effect(() => {
      const open_note = editor_store.open_note;
      const _session_rev = editor_store.session_revision;

      if (!open_note) {
        last_note_id = null;
        last_buffer_id = null;
        return;
      }

      if (!editor_service.is_mounted()) {
        last_note_id = open_note.meta.id;
        last_buffer_id = open_note.buffer_id;
        return;
      }

      const previous_note_id = last_note_id;
      const should_open = resolve_editor_sync_open({
        open_note_id: open_note.meta.id,
        open_note_buffer_id: open_note.buffer_id,
        last_note_id: previous_note_id,
        last_buffer_id,
      });

      last_note_id = open_note.meta.id;
      last_buffer_id = open_note.buffer_id;

      if (!should_open) return;

      const mode = editor_store.editor_mode;
      if (mode === "source" && !editor_store.split_view) {
        editor_service.set_active_note(open_note);
        editor_store.consume_pending_cursor_restore();
        return;
      }

      const restore_policy = resolve_editor_sync_restore_policy({
        open_note_id: open_note.meta.id,
        last_note_id: previous_note_id,
      });

      const pending = editor_store.consume_pending_cursor_restore();
      const restore_cursor_offset = resolve_editor_sync_cursor_offset(pending);

      editor_service.open_buffer(
        open_note,
        restore_policy,
        restore_cursor_offset,
      );

      if (restore_cursor_offset !== undefined) {
        editor_service.set_cursor_from_markdown_offset(restore_cursor_offset);
      }

      const restore_scroll_top = resolve_editor_sync_scroll_top(pending);
      if (restore_scroll_top !== undefined) {
        editor_service.set_scroll_top(restore_scroll_top);
      }
    });
  });
}
