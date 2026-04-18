import type { ReferenceStore } from "$lib/features/reference";
import type { NotesStore } from "$lib/features/note";
import type { VaultStore } from "$lib/features/vault";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { untrack } from "svelte";

export function create_linked_source_tree_reactor(
  vault_store: VaultStore,
  reference_store: ReferenceStore,
  notes_store: NotesStore,
  ui_store: UIStore,
) {
  return $effect.root(() => {
    $effect(() => {
      if (!vault_store.active_vault_id) return;
      if (!ui_store.editor_settings_loaded) return;

      const show = ui_store.editor_settings.file_tree_show_linked_sources;

      if (!show) {
        untrack(() => notes_store.remove_folder("@linked"));
        return;
      }

      const sources = reference_store.linked_sources.filter((s) => s.enabled);
      if (sources.length === 0) return;

      const folder_paths = ["@linked"];
      for (const source of sources) {
        folder_paths.push(`@linked/${source.name}`);
      }

      untrack(() => {
        for (const path of folder_paths) {
          notes_store.add_folder_path(path);
        }
      });
    });
  });
}
