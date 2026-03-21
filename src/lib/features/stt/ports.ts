import type {
  AudioDeviceInfo,
  DownloadProgress,
  ModelInfo,
  ModelStateEvent,
  TranscriptionResult,
} from "$lib/features/stt/types/stt_types";

export interface SttPort {
  start_recording(device_name?: string, vad_threshold?: number): Promise<void>;
  stop_recording(): Promise<number[]>;
  cancel_recording(): Promise<void>;
  get_recording_state(): Promise<string>;

  list_models(): Promise<ModelInfo[]>;
  download_model(model_id: string): Promise<void>;
  delete_model(model_id: string): Promise<void>;
  cancel_download(model_id: string): Promise<void>;

  load_model(model_id: string): Promise<void>;
  unload_model(): Promise<void>;
  transcribe(audio: number[], language?: string): Promise<TranscriptionResult>;
  transcribe_file(
    file_path: string,
    language?: string,
  ): Promise<TranscriptionResult>;

  list_audio_devices(): Promise<AudioDeviceInfo[]>;

  subscribe_audio_levels(cb: (levels: number[]) => void): () => void;
  subscribe_download_progress(
    cb: (progress: DownloadProgress) => void,
  ): () => void;
  subscribe_model_state(cb: (event: ModelStateEvent) => void): () => void;
  subscribe_recording_state(cb: (state: string) => void): () => void;
}
