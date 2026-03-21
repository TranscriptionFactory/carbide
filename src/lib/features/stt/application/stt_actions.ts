import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { SttService } from "$lib/features/stt/application/stt_service";
import type { SttStore } from "$lib/features/stt/state/stt_store.svelte";
import { toast } from "svelte-sonner";

export function register_stt_actions(input: {
  registry: ActionRegistry;
  stt_service: SttService;
  stt_store: SttStore;
}) {
  const { registry, stt_service, stt_store } = input;

  registry.register({
    id: ACTION_IDS.stt_toggle_recording,
    label: "Toggle Voice Recording",
    shortcut: "Cmd+Shift+R",
    execute: async () => {
      if (!stt_store.config.enabled) {
        toast.info("Speech-to-text is not enabled. Enable it in Settings.");
        return;
      }

      if (!stt_store.is_ready && !stt_store.is_recording) {
        toast.info("Download a speech model first.", {
          action: {
            label: "Open Settings",
            onClick: () => registry.execute(ACTION_IDS.stt_open_settings),
          },
        });
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
