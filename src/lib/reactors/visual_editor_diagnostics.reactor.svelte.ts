import type { DiagnosticsStore } from "$lib/features/diagnostics";
import type { EditorService } from "$lib/features/editor";
import type { UIStore } from "$lib/app";

export function create_visual_editor_diagnostics_reactor(
  diagnostics_store: DiagnosticsStore,
  editor_service: EditorService,
  ui_store: UIStore,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const display_enabled =
        ui_store.editor_settings.diagnostics_display_enabled;
      const diagnostics = display_enabled
        ? diagnostics_store.active_diagnostics
        : [];
      editor_service.update_visual_editor_diagnostics(diagnostics);
    });
  });
}
