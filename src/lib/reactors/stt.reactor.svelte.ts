import type { SttStore, SttService, SttPort } from "$lib/features/stt";
import type { VaultStore } from "$lib/features/vault";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("stt_reactor");

export function create_stt_reactor(
  vault_store: VaultStore,
  stt_store: SttStore,
  stt_service: SttService,
  stt_port: SttPort,
): () => void {
  const unsub_model_state = stt_port.subscribe_model_state((event) => {
    switch (event.event_type) {
      case "unloaded":
        stt_store.set_active_model(null);
        stt_store.set_model_loading(false);
        break;
      case "loading_started":
        stt_store.set_model_loading(true);
        break;
      case "loading_completed":
        stt_store.set_model_loading(false);
        break;
      case "loading_failed":
        stt_store.set_model_loading(false);
        log.error("Model loading failed", { error: event.error });
        break;
    }
  });

  const unsub_download_progress = stt_port.subscribe_download_progress(
    (progress) => {
      stt_store.update_model(progress.model_id, {
        is_downloading: progress.percentage < 100,
      });
    },
  );

  const cleanup_effects = $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.active_vault_id;
      if (vault_id) {
        const model_id = stt_store.config.model_id;
        if (model_id) {
          void stt_service.select_model(model_id);
        }
      } else {
        stt_store.reset();
      }
    });

    $effect(() => {
      const model_id = stt_store.config.model_id;
      if (model_id && model_id !== stt_store.active_model_id) {
        void stt_service.select_model(model_id);
      }
    });
  });

  return () => {
    cleanup_effects();
    unsub_model_state();
    unsub_download_progress();
  };
}
