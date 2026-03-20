import type { EditorStore, EditorService } from "$lib/features/editor";
import type {
  SplitViewService,
  SplitViewStore,
} from "$lib/features/split_view";
import { resolve_content_sync_direction } from "$lib/features/split_view";
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
  let last_synced_primary: string | null = null;
  let last_synced_secondary: string | null = null;
  let sync_in_progress = false;

  const debounced_sync = create_debounced_task_controller<SyncPayload>({
    run(payload) {
      const secondary_editor = split_view_service.get_secondary_editor();
      const secondary_store = split_view_service.get_secondary_editor_store();
      if (!secondary_editor || !secondary_store) return;

      sync_in_progress = true;
      try {
        if (payload.direction === "primary_to_secondary") {
          const cursor_offset = secondary_editor.get_cursor_markdown_offset();
          secondary_editor.sync_visual_from_markdown(payload.markdown);
          secondary_store.set_markdown(
            payload.note_id as Parameters<
              typeof secondary_store.set_markdown
            >[0],
            as_markdown_text(payload.markdown),
          );
          secondary_editor.set_cursor_from_markdown_offset(cursor_offset);
        } else {
          const cursor_offset = editor_service.get_cursor_markdown_offset();
          editor_store.set_markdown(
            payload.note_id as Parameters<typeof editor_store.set_markdown>[0],
            as_markdown_text(payload.markdown),
          );
          editor_service.sync_visual_from_markdown(payload.markdown);
          editor_service.set_cursor_from_markdown_offset(cursor_offset);
        }
        last_synced_primary = payload.markdown;
        last_synced_secondary = payload.markdown;
      } finally {
        sync_in_progress = false;
      }
    },
  });

  return $effect.root(() => {
    $effect(() => {
      const primary_note = editor_store.open_note;
      const secondary_store = split_view_service.get_secondary_editor_store();
      const is_active = split_view_store.active;
      const secondary_profile = split_view_store.secondary_profile;

      if (!is_active || !secondary_store || secondary_profile !== "full") {
        return;
      }

      if (sync_in_progress) return;

      const secondary_note = secondary_store.open_note;
      if (!primary_note || !secondary_note) return;
      if (primary_note.meta.id !== secondary_note.meta.id) return;

      const primary_markdown = primary_note.markdown;
      const secondary_markdown = secondary_note.markdown;

      const result = resolve_content_sync_direction({
        primary_markdown,
        secondary_markdown,
        last_synced_primary,
        last_synced_secondary,
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
