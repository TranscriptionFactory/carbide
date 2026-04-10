import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { SttService } from "$lib/features/stt/application/stt_service";
import type { SttStore } from "$lib/features/stt/state/stt_store.svelte";
import type { UIStore } from "$lib/app";
import { toast } from "svelte-sonner";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("stt_actions");

export function register_stt_actions(input: {
  registry: ActionRegistry;
  stt_service: SttService;
  stt_store: SttStore;
  ui_store: UIStore;
}) {
  const { registry, stt_service, stt_store, ui_store } = input;

  registry.register({
    id: ACTION_IDS.stt_toggle_recording,
    label: "Toggle Voice Recording",
    execute: async () => {
      log.info("Toggle recording triggered", {
        enabled: ui_store.editor_settings.stt_enabled,
        is_ready: stt_store.is_ready,
        is_recording: stt_store.is_recording,
        active_model: stt_store.active_model_id,
        recording_state: stt_store.recording_state,
      });

      if (!ui_store.editor_settings.stt_enabled) {
        toast.info("Speech-to-text is not enabled. Enable it in Settings.", {
          action: {
            label: "Open Settings",
            onClick: () => registry.execute(ACTION_IDS.stt_open_settings),
          },
        });
        return;
      }

      if (!stt_store.is_ready && !stt_store.is_recording) {
        const loading = stt_store.model_loading;
        if (loading) {
          toast.info("Speech model is still loading. Please wait.");
        } else {
          toast.info(
            "No speech model loaded. Download or select one in Settings.",
            {
              action: {
                label: "Open Settings",
                onClick: () => registry.execute(ACTION_IDS.stt_open_settings),
              },
            },
          );
        }
        return;
      }

      await stt_service.toggle_recording();
    },
  });

  registry.register({
    id: ACTION_IDS.stt_cancel_recording,
    label: "Cancel Voice Recording",
    execute: async () => {
      if (stt_store.is_recording) {
        await stt_service.cancel_recording();
      }
    },
  });

  registry.register({
    id: ACTION_IDS.stt_select_model,
    label: "Select Speech Model",
    execute: async (...args: unknown[]) => {
      const model_id = args[0] as string;
      if (model_id) {
        await stt_service.select_model(model_id);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.stt_download_model,
    label: "Download Speech Model",
    execute: async (...args: unknown[]) => {
      const model_id = args[0] as string;
      if (model_id) {
        await stt_service.download_model(model_id);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.stt_delete_model,
    label: "Delete Speech Model",
    execute: async (...args: unknown[]) => {
      const model_id = args[0] as string;
      if (model_id) {
        await stt_service.delete_model(model_id);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.stt_add_custom_model,
    label: "Add Custom Speech Model",
    execute: async (...args: unknown[]) => {
      const path = args[0] as string;
      const engine_type = args[1] as string;
      if (path && engine_type) {
        await stt_service.add_custom_model(path, engine_type);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.stt_remove_custom_model,
    label: "Remove Custom Speech Model",
    execute: async (...args: unknown[]) => {
      const model_id = args[0] as string;
      if (model_id) {
        await stt_service.remove_custom_model(model_id);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.stt_refresh_models,
    label: "Refresh Speech Models",
    execute: async () => {
      await stt_service.refresh_models();
    },
  });

  registry.register({
    id: ACTION_IDS.stt_open_settings,
    label: "Speech-to-Text Settings",
    execute: async () => {
      await registry.execute(ACTION_IDS.settings_open, "speech");
    },
  });

  registry.register({
    id: ACTION_IDS.stt_transcribe_file,
    label: "Transcribe Audio File",
    execute: async (...args: unknown[]) => {
      const file_path = args[0] as string;
      if (file_path) {
        await stt_service.transcribe_file(file_path);
      }
    },
  });
}
