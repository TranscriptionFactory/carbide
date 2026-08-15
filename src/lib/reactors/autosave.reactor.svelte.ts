import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app";
import type { NoteService } from "$lib/features/note";
import type { TabService } from "$lib/features/tab";
import { is_draft_note_path } from "$lib/features/note";
import { create_debounced_task_controller } from "$lib/reactors/debounced_task";
import { create_logger } from "$lib/shared/utils/logger";
import type { NotePath } from "$lib/shared/types/ids";

const log = create_logger("autosave_reactor");

function create_note_autosave_reactor(
  get_editor_store: () => EditorStore | null,
  ui_store: UIStore,
  save_note: (note_path: NotePath) => void,
): () => void {
  const autosave = create_debounced_task_controller<NotePath>({
    run: save_note,
  });

  return $effect.root(() => {
    $effect(() => {
      const editor_store = get_editor_store();
      const open_note = editor_store?.open_note;

      if (!ui_store.editor_settings.autosave_enabled) {
        return;
      }
      // Held, not skipped: re-reading this flag re-runs the effect, and the
      // previous run's cleanup cancels a save already queued before the
      // preview opened. Without that, a buffer dirty at run start still gets
      // written mid-stream and the accept diffs against a note that moved.
      if (editor_store?.ai_preview_active) {
        return;
      }
      if (!open_note?.is_dirty) {
        return;
      }

      const note_path = open_note.meta.path;
      if (is_draft_note_path(note_path)) {
        return;
      }

      autosave.schedule(note_path, ui_store.editor_settings.autosave_delay_ms);

      return () => {
        autosave.cancel();
      };
    });
  });
}

export function create_autosave_reactor(
  editor_store: EditorStore,
  ui_store: UIStore,
  note_service: NoteService,
  tab_service: TabService,
  save_target: "primary" | "secondary" = "primary",
): () => void {
  return create_note_autosave_reactor(
    () => editor_store,
    ui_store,
    (note_path) => {
      void note_service.save_note(null, true, save_target).then((result) => {
        if (result.status === "conflict" && save_target === "primary") {
          log.info("Autosave raised the external-modification card", {
            path: note_path,
            cause: "disk_mtime_guard_rejected_the_write",
          });
          tab_service.mark_conflict(note_path);
        }
      });
    },
  );
}
