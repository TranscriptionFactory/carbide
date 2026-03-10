import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app";
import type { NoteService } from "$lib/features/note";
import type { TabService } from "$lib/features/tab";
import { is_draft_note_path } from "$lib/features/note";
import type { NotePath } from "$lib/shared/types/ids";

const AUTOSAVE_DELAY_MS = 2000;

export function create_autosave_reactor(
  editor_store: EditorStore,
  ui_store: UIStore,
  note_service: NoteService,
  tab_service: TabService,
  save_target: "primary" | "secondary" = "primary",
): () => void {
  return $effect.root(() => {
    $effect(() => {
      if (!ui_store.editor_settings.autosave_enabled) {
        return;
      }

      const open_note = editor_store.open_note;
      if (!open_note?.is_dirty) return;
      if (is_draft_note_path(open_note.meta.path)) return;

      const note_path = open_note.meta.path;

      const handle = setTimeout(() => {
        void note_service.save_note(null, true, save_target).then((result) => {
          if (result.status === "conflict") {
            if (save_target === "primary") {
              tab_service.mark_conflict(note_path);
            }
          }
        });
      }, AUTOSAVE_DELAY_MS);

      return () => {
        clearTimeout(handle);
      };
    });
  });
}

export function create_split_view_autosave_reactor(
  get_secondary_editor_store: () => EditorStore | null,
  ui_store: UIStore,
  note_service: NoteService,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const secondary_store = get_secondary_editor_store();
      const open_note = secondary_store?.open_note;

      if (!ui_store.editor_settings.autosave_enabled) {
        return;
      }
      if (!open_note?.is_dirty) {
        return;
      }
      if (is_draft_note_path(open_note.meta.path)) {
        return;
      }

      const note_path: NotePath = open_note.meta.path;
      const handle = setTimeout(() => {
        void note_service.save_note(null, true, "secondary").then((result) => {
          if (
            result.status === "saved" &&
            secondary_store?.open_note?.meta.path === note_path
          ) {
            secondary_store.mark_clean(note_path);
          }
        });
      }, AUTOSAVE_DELAY_MS);

      return () => {
        clearTimeout(handle);
      };
    });
  });
}
