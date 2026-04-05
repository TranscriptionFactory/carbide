import type { UIStore } from "$lib/app";
import type { EditorStore, EditorService } from "$lib/features/editor";
import type { SearchStore } from "$lib/features/search";

export function create_find_in_file_reactor(
  ui_store: UIStore,
  editor_store: EditorStore,
  editor_service: EditorService,
  search_store: SearchStore,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const { open, query, selected_match_index } = ui_store.find_in_file;
      const _session_rev = editor_store.session_revision;

      if (!open || !query) {
        editor_service.update_find_state("", 0);
        search_store.set_find_match_count(0);
        return;
      }

      const count = editor_service.update_find_state(
        query,
        selected_match_index,
      );
      search_store.set_find_match_count(count);
    });
  });
}
