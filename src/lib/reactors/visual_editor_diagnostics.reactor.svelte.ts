import type { DiagnosticsStore } from "$lib/features/diagnostics";
import type { EditorService } from "$lib/features/editor";

export function create_visual_editor_diagnostics_reactor(
  diagnostics_store: DiagnosticsStore,
  editor_service: EditorService,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const diagnostics = diagnostics_store.active_diagnostics;
      editor_service.update_visual_editor_diagnostics(diagnostics);
    });
  });
}
