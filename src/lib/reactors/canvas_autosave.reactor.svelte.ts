import type { UIStore } from "$lib/app";
import type { CanvasService, CanvasStore } from "$lib/features/canvas";

export function create_canvas_autosave_reactor(
  canvas_store: CanvasStore,
  ui_store: UIStore,
  canvas_service: CanvasService,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      if (!ui_store.editor_settings.autosave_enabled) return;
      const dirty_tab_ids = [...canvas_store.states.values()]
        .filter((state) => state.is_dirty && state.status === "ready")
        .map((state) => state.tab_id);
      if (dirty_tab_ids.length === 0) return;

      const timer = setTimeout(() => {
        for (const tab_id of dirty_tab_ids) {
          void canvas_service.save_canvas(tab_id);
        }
      }, ui_store.editor_settings.autosave_delay_ms);

      return () => {
        clearTimeout(timer);
      };
    });
  });
}
