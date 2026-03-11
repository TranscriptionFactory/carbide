import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app";
import type { NoteService } from "$lib/features/note";
import type { TabService } from "$lib/features/tab";
import { is_draft_note_path } from "$lib/features/note";
import { create_debounced_task_controller } from "$lib/reactors/debounced_task";
import type { NotePath } from "$lib/shared/types/ids";

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
          tab_service.mark_conflict(note_path);
        }
      });
    },
  );
}

export function create_split_view_autosave_reactor(
  get_secondary_editor_store: () => EditorStore | null,
  ui_store: UIStore,
  note_service: NoteService,
): () => void {
  return create_note_autosave_reactor(
    get_secondary_editor_store,
    ui_store,
    (note_path) => {
      void note_service.save_note(null, true, "secondary").then((result) => {
        const secondary_store = get_secondary_editor_store();
        if (
          result.status === "saved" &&
          secondary_store?.open_note?.meta.path === note_path
        ) {
          secondary_store.mark_clean(note_path);
        }
      });
    },
  );
}
