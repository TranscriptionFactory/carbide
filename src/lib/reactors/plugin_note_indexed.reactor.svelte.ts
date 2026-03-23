import type { SearchStore } from "$lib/features/search";
import type { PluginService } from "$lib/features/plugin";

export function create_plugin_note_indexed_reactor(
  search_store: SearchStore,
  plugin_service: PluginService,
): () => void {
  let last_index_status: string = "idle";

  return $effect.root(() => {
    $effect(() => {
      const status = search_store.index_progress.status;
      if (status === "completed" && last_index_status !== "completed") {
        const indexed = search_store.index_progress.indexed;
        plugin_service.emit_plugin_event("note-indexed", { indexed });
      }
      last_index_status = status;
    });
  });
}
