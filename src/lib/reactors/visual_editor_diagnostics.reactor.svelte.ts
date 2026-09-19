import type { DiagnosticsStore } from "$lib/features/diagnostics";
import type { EditorService, EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app";

export function create_visual_editor_diagnostics_reactor(
  diagnostics_store: DiagnosticsStore,
  editor_service: EditorService,
  ui_store: UIStore,
  editor_store: EditorStore,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const display_enabled =
        ui_store.editor_settings.diagnostics_display_enabled;
      // Diagnostics carry markdown offsets, so publishing them while the live
      // document is ahead of its serialized snapshot decorates stale text.
      // Publish on the serialize-complete transition instead, and keep the
      // clear path immediate when the display is disabled.
      const behind = display_enabled && editor_store.doc_ahead_of_snapshot;
      const diagnostics = display_enabled
        ? diagnostics_store.active_diagnostics
        : [];
      if (behind) return;
      editor_service.update_visual_editor_diagnostics(diagnostics);
    });
  });
}
