import type { EditorStore } from "$lib/features/editor";
import type { IweService, IweStore } from "$lib/features/iwe";

const DEBOUNCE_MS = 500;

export function create_iwe_document_sync_reactor(
  editor_store: EditorStore,
  iwe_store: IweStore,
  iwe_service: IweService,
): () => void {
  return $effect.root(() => {
    let previous_path: string | null = null;

    $effect(() => {
      const open_note = editor_store.open_note;
      const status = iwe_store.status;

      if (status !== "running") {
        previous_path = null;
        return;
      }

      const current_path = open_note?.meta.path ?? null;

      if (current_path && current_path !== previous_path) {
        const content = open_note?.markdown ?? "";
        void iwe_service.did_open(current_path, content);
      }

      previous_path = current_path;
    });

    let debounce_timer: ReturnType<typeof setTimeout> | null = null;

    $effect(() => {
      const open_note = editor_store.open_note;
      const status = iwe_store.status;

      if (!open_note || status !== "running") return;

      const path = open_note.meta.path;
      const content = open_note.markdown;
      const is_dirty = open_note.is_dirty;

      if (!is_dirty) return;

      if (debounce_timer) clearTimeout(debounce_timer);
      debounce_timer = setTimeout(() => {
        void iwe_service.did_change(path, content ?? "");
        debounce_timer = null;
      }, DEBOUNCE_MS);

      return () => {
        if (debounce_timer) {
          clearTimeout(debounce_timer);
          debounce_timer = null;
        }
      };
    });

    let was_dirty = false;

    $effect(() => {
      const open_note = editor_store.open_note;
      const status = iwe_store.status;
      const is_dirty = open_note?.is_dirty ?? false;

      const just_saved = was_dirty && !is_dirty;
      was_dirty = is_dirty;

      if (!just_saved || status !== "running" || !open_note) return;

      void iwe_service.did_save(open_note.meta.path, open_note.markdown ?? "");
    });
  });
}
