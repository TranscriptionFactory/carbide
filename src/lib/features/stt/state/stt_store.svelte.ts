import {
  DEFAULT_STT_CONFIG,
  type ModelInfo,
  type SttConfig,
  type SttRecordingState,
} from "$lib/features/stt/types/stt_types";

export class SttStore {
  recording_state = $state<SttRecordingState>("idle");
  audio_levels = $state<number[]>([]);

  available_models = $state<ModelInfo[]>([]);
  active_model_id = $state<string | null>(null);
  model_loading = $state<boolean>(false);

  config = $state<SttConfig>({ ...DEFAULT_STT_CONFIG });

  get active_model(): ModelInfo | undefined {
    return this.available_models.find((m) => m.id === this.active_model_id);
  }

  get is_ready(): boolean {
    const model = this.active_model;
    return !!model?.is_downloaded && !this.model_loading;
  }

  get downloaded_models(): ModelInfo[] {
    return this.available_models.filter((m) => m.is_downloaded);
  }

  get is_recording(): boolean {
    return this.recording_state === "recording";
  }

  get is_processing(): boolean {
    return this.recording_state === "processing";
  }

  set_recording_state(state: SttRecordingState) {
    this.recording_state = state;
  }

  set_audio_levels(levels: number[]) {
    this.audio_levels = levels;
  }

  set_available_models(models: ModelInfo[]) {
    this.available_models = models;
  }

  set_active_model(model_id: string | null) {
    this.active_model_id = model_id;
  }

  set_model_loading(loading: boolean) {
    this.model_loading = loading;
  }

  update_model(model_id: string, update: Partial<ModelInfo>) {
    this.available_models = this.available_models.map((m) =>
      m.id === model_id ? { ...m, ...update } : m,
    );
  }

  update_config(partial: Partial<SttConfig>) {
    this.config = { ...this.config, ...partial };
  }

  reset() {
    this.recording_state = "idle";
    this.audio_levels = [];
    this.model_loading = false;
  }
}
