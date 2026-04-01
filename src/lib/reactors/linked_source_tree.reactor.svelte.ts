import type { ReferenceStore } from "$lib/features/reference";
import type { NotesStore } from "$lib/features/note";
import type { VaultStore } from "$lib/features/vault";

export function create_linked_source_tree_reactor(
  vault_store: VaultStore,
  reference_store: ReferenceStore,
  notes_store: NotesStore,
) {
  return $effect.root(() => {
    $effect(() => {
      if (!vault_store.active_vault_id) return;

      const sources = reference_store.linked_sources.filter((s) => s.enabled);
      if (sources.length === 0) return;

      const folder_paths = ["@linked"];
      for (const source of sources) {
        folder_paths.push(`@linked/${source.name}`);
      }

      for (const path of folder_paths) {
        notes_store.add_folder_path(path);
      }
    });
  });
}
