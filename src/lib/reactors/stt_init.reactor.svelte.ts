import type { UIStore } from "$lib/app";
import type { SttStore } from "$lib/features/stt";
import type { SttService } from "$lib/features/stt";
import { create_logger } from "$lib/shared/utils/logger";
import { toast } from "svelte-sonner";

const log = create_logger("stt_init");

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

      stt_service.subscribe_model_state();

      const model_id = stt_store.config.model_id;

      void stt_service.refresh_models().then(() => {
        if (!model_id) {
          log.info("No model configured");
          return;
        }

        const model = stt_store.available_models.find((m) => m.id === model_id);

        if (!model) {
          log.warn("Configured model not found in catalog", { model_id });
          toast.info(
            "Configured speech model not found. Open Settings to download one.",
            {
              duration: 5000,
            },
          );
          return;
        }

        if (!model.is_downloaded) {
          log.info("Configured model not yet downloaded", { model_id });
          toast.info(
            `Speech model "${model.name}" needs to be downloaded. Open Settings to download it.`,
            { duration: 5000 },
          );
          return;
        }

        log.info("Loading speech model", { model_id });
        void stt_service.select_model(model_id);
      });
    });
  });
}
