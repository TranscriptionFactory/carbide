import type { UIStore } from "$lib/app";
import type { SttStore } from "$lib/features/stt";
import type { SttService } from "$lib/features/stt";

export function create_stt_init_reactor(
  ui_store: UIStore,
  stt_store: SttStore,
  stt_service: SttService,
): () => void {
  return $effect.root(() => {
    let initialized = false;

    $effect(() => {
      if (!ui_store.editor_settings_loaded) return;

      const enabled = stt_store.config.enabled;
      if (!enabled) {
        initialized = false;
        return;
      }

      if (initialized) return;
      initialized = true;

      const model_id = stt_store.config.model_id;

      void stt_service.refresh_models().then(() => {
        if (model_id) {
          void stt_service.select_model(model_id);
        }
      });
    });
  });
}
