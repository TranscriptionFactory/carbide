import type { EditorStore } from "$lib/features/editor";
import type { DiagnosticsStore } from "$lib/features/diagnostics";

export function create_diagnostics_active_file_reactor(
  editor_store: EditorStore,
  diagnostics_store: DiagnosticsStore,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const path = editor_store.open_note?.meta.path ?? null;
      diagnostics_store.set_active_file(path);
    });
  });
}
