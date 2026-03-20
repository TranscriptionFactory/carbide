import type { EditorStore, EditorService } from "$lib/features/editor";
import type {
  SplitViewService,
  SplitViewStore,
} from "$lib/features/split_view";
import {
  resolve_active_pane_sync,
  normalize_for_comparison,
} from "$lib/features/split_view";
import { create_debounced_task_controller } from "$lib/reactors/debounced_task";
import { as_markdown_text } from "$lib/shared/types/ids";

const SYNC_DEBOUNCE_MS = 150;

type SyncPayload = {
  direction: "primary_to_secondary" | "secondary_to_primary";
  markdown: string;
  note_id: string;
};

export function create_split_view_content_sync_reactor(
  editor_store: EditorStore,
  editor_service: EditorService,
  split_view_service: SplitViewService,
  split_view_store: SplitViewStore,
): () => void {
  let last_synced_content: string | null = null;

  const debounced_sync = create_debounced_task_controller<SyncPayload>({
    run(payload) {
      const secondary_editor = split_view_service.get_secondary_editor();
      const secondary_store = split_view_service.get_secondary_editor_store();
      if (!secondary_editor || !secondary_store) return;

      const note_id = payload.note_id as Parameters<
        typeof editor_store.set_markdown
      >[0];

      if (payload.direction === "primary_to_secondary") {
        const receiver_was_dirty = secondary_store.open_note?.is_dirty ?? false;
        const cursor_offset = secondary_editor.get_cursor_markdown_offset();
        secondary_editor.sync_visual_from_markdown(payload.markdown);
        secondary_store.set_markdown(
          note_id,
          as_markdown_text(payload.markdown),
        );
        secondary_editor.set_cursor_from_markdown_offset(cursor_offset);
        secondary_store.set_dirty(note_id, receiver_was_dirty);
      } else {
        const receiver_was_dirty = editor_store.open_note?.is_dirty ?? false;
        const cursor_offset = editor_service.get_cursor_markdown_offset();
        editor_service.sync_visual_from_markdown(payload.markdown);
        editor_store.set_markdown(note_id, as_markdown_text(payload.markdown));
        editor_service.set_cursor_from_markdown_offset(cursor_offset);
        editor_store.set_dirty(note_id, receiver_was_dirty);
      }

      last_synced_content = normalize_for_comparison(payload.markdown);
    },
  });

  return $effect.root(() => {
    $effect(() => {
      const primary_note = editor_store.open_note;
      const secondary_store = split_view_service.get_secondary_editor_store();
      const is_active = split_view_store.active;
      const secondary_profile = split_view_store.secondary_profile;

      if (!is_active || !secondary_store || secondary_profile !== "full") {
        last_synced_content = null;
        return;
      }

      const secondary_note = secondary_store.open_note;
      if (!primary_note || !secondary_note) return;
      if (primary_note.meta.id !== secondary_note.meta.id) return;

      const active_pane = split_view_store.active_pane;
      const source_markdown =
        active_pane === "primary"
          ? primary_note.markdown
          : secondary_note.markdown;

      const result = resolve_active_pane_sync({
        active_pane,
        source_markdown,
        last_synced_content,
      });

      if (result.direction === "none") return;

      debounced_sync.schedule(
        {
          direction: result.direction,
          markdown: result.markdown,
          note_id: primary_note.meta.id,
        },
        SYNC_DEBOUNCE_MS,
      );

      return () => {
        debounced_sync.cancel();
      };
    });
  });
}
