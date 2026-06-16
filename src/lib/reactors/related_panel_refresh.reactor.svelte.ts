import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app";
import type { LinksService } from "$lib/features/links";
import type { MetadataStore } from "$lib/features/metadata";
import { create_debounced_task_controller } from "$lib/reactors/debounced_task";

const DEBOUNCE_MS = 300;

export function create_related_panel_refresh_reactor(
  editor_store: EditorStore,
  ui_store: UIStore,
  metadata_store: MetadataStore,
  links_service: LinksService,
): () => void {
  let last_key: string | null = null;

  const debounced = create_debounced_task_controller<{
    note_path: string;
    limit: number;
    threshold: number;
    tags: string[];
  }>({
    run: ({ note_path, limit, threshold, tags }) => {
      void links_service.load_suggested_links(note_path, limit, threshold);
      void links_service.load_related_context(note_path, tags);
    },
  });

  return $effect.root(() => {
    $effect(() => {
      const note_path = editor_store.open_note?.meta.path ?? null;
      const panel_open =
        ui_store.context_rail_open && ui_store.context_rail_tab === "related";
      const limit = ui_store.editor_settings.semantic_suggested_links_limit;
      const threshold = ui_store.editor_settings.semantic_similarity_threshold;
      const tags = metadata_store.tags.map((t) => t.tag);

      if (!note_path || !panel_open) {
        if (!note_path) {
          last_key = null;
          debounced.cancel();
          links_service.clear_suggested_links();
          links_service.clear_related();
        }
        return;
      }

      const key = `${note_path}\n${tags.join(",")}`;
      if (key !== last_key) {
        last_key = key;
        debounced.schedule({ note_path, limit, threshold, tags }, DEBOUNCE_MS);
      }
    });
  });
}
