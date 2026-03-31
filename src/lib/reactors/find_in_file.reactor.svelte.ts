import type { UIStore } from "$lib/app";
import type { EditorStore, EditorService } from "$lib/features/editor";

export function create_find_in_file_reactor(
  ui_store: UIStore,
  editor_store: EditorStore,
  editor_service: EditorService,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const { open, query, selected_match_index } = ui_store.find_in_file;
      const _session_rev = editor_store.session_revision;

      if (!open || !query) {
        editor_service.update_find_state("", 0);
        return;
      }

      editor_service.update_find_state(query, selected_match_index);
    });
  });
}
