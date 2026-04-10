import type { SttPort } from "$lib/features/stt/ports";
import type {
  AudioDeviceInfo,
  DownloadProgress,
  ModelInfo,
  ModelStateEvent,
  TranscriptionResult,
} from "$lib/features/stt/types/stt_types";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { listen } from "@tauri-apps/api/event";

function subscribe_tauri_event<T>(
  event_name: string,
  callback: (payload: T) => void,
): () => void {
  let unlisten_fn: (() => void) | null = null;
  let is_disposed = false;

  listen<T>(event_name, (event) => {
    if (is_disposed) return;
    callback(event.payload);
  })
    .then((fn_ref) => {
      if (is_disposed) {
        try {
          Promise.resolve(fn_ref()).catch(() => {});
        } catch {
          /* already unregistered */
        }
        return;
      }
      unlisten_fn = fn_ref;
    })
    .catch((error: unknown) => {
      console.error(`Failed to setup ${event_name} listener`, error);
    });

  return () => {
    is_disposed = true;
    if (unlisten_fn) {
      const fn = unlisten_fn;
      unlisten_fn = null;
      try {
        Promise.resolve(fn()).catch(() => {});
      } catch {
        /* already unregistered */
      }
    }
  };
}

export function create_stt_tauri_adapter(): SttPort {
  return {
    async start_recording(device_name, vad_threshold) {
      await tauri_invoke<undefined>("stt_start_recording", {
        deviceName: device_name ?? null,
        vadThreshold: vad_threshold ?? null,
      });
    },

    async stop_recording() {
      return await tauri_invoke<number[]>("stt_stop_recording");
    },

    async cancel_recording() {
      await tauri_invoke<undefined>("stt_cancel_recording");
    },

    async get_recording_state() {
      return await tauri_invoke<string>("stt_get_recording_state");
    },

    async list_models() {
      return await tauri_invoke<ModelInfo[]>("stt_list_models");
    },

    async download_model(model_id) {
      await tauri_invoke<undefined>("stt_download_model", {
        modelId: model_id,
      });
    },

    async delete_model(model_id) {
      await tauri_invoke<undefined>("stt_delete_model", {
        modelId: model_id,
      });
    },

    async cancel_download(model_id) {
      await tauri_invoke<undefined>("stt_cancel_download", {
        modelId: model_id,
      });
    },

    async load_model(model_id) {
      await tauri_invoke<undefined>("stt_load_model", {
        modelId: model_id,
      });
    },

    async unload_model() {
      await tauri_invoke<undefined>("stt_unload_model");
    },

    async transcribe(audio, language) {
      return await tauri_invoke<TranscriptionResult>("stt_transcribe", {
        audio,
        language: language ?? null,
      });
    },

    async transcribe_file(file_path, language) {
      return await tauri_invoke<TranscriptionResult>("stt_transcribe_file", {
        filePath: file_path,
        language: language ?? null,
      });
    },

    async list_audio_devices() {
      return await tauri_invoke<AudioDeviceInfo[]>("stt_list_audio_devices");
    },

    subscribe_audio_levels(cb) {
      return subscribe_tauri_event<{ levels: number[] }>(
        "stt_audio_level",
        (payload) => {
          cb(payload.levels);
        },
      );
    },

    subscribe_download_progress(cb) {
      return subscribe_tauri_event<DownloadProgress>(
        "stt_download_progress",
        (payload) => {
          cb(payload);
        },
      );
    },

    subscribe_model_state(cb) {
      return subscribe_tauri_event<ModelStateEvent>(
        "stt_model_state",
        (payload) => {
          cb(payload);
        },
      );
    },

    subscribe_recording_state(cb) {
      return subscribe_tauri_event<{ state: string }>(
        "stt_recording_state",
        (payload) => {
          cb(payload.state);
        },
      );
    },
  };
}
