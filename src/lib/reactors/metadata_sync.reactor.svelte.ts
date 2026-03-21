import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app";
import type { MetadataService } from "$lib/features/metadata";
import type { MetadataStore } from "$lib/features/metadata";

export function create_metadata_sync_reactor(
  editor_store: EditorStore,
  ui_store: UIStore,
  metadata_store: MetadataStore,
  metadata_service: MetadataService,
) {
  return $effect.root(() => {
    $effect(() => {
      const note_path = editor_store.open_note?.meta.path ?? null;
      const panel_open =
        ui_store.context_rail_open && ui_store.context_rail_tab === "metadata";

      if (!note_path || !panel_open) {
        if (metadata_store.note_path) {
          metadata_service.clear();
        }
        return;
      }

      if (note_path !== metadata_store.note_path) {
        void metadata_service.refresh(note_path);
      }
    });
  });
}
