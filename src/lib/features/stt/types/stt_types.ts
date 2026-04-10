export type SttRecordingState = "idle" | "recording" | "processing";

export type ModelInfo = {
  id: string;
  name: string;
  description: string;
  filename: string;
  url: string | null;
  size_mb: number;
  is_downloaded: boolean;
  is_downloading: boolean;
  is_directory: boolean;
  engine_type: string;
  accuracy_score: number;
  speed_score: number;
  supports_translation: boolean;
  is_recommended: boolean;
  supported_languages: string[];
  supports_language_selection: boolean;
};

export type TranscriptionResult = {
  text: string;
  language: string | null;
  duration_ms: number;
  model_id: string;
};

export type SttConfig = {
  enabled: boolean;
  model_id: string;
  language: string;
  vad_threshold: number;
  filter_filler_words: boolean;
  custom_words: string[];
  idle_unload_minutes: number;
  insert_mode: "cursor" | "new_line" | "new_block";
  streaming_enabled: boolean;
  ai_cleanup_enabled: boolean;
  ai_cleanup_prompt: string;
};

export type DownloadProgress = {
  model_id: string;
  downloaded: number;
  total: number;
  percentage: number;
};

export type ModelStateEvent = {
  event_type:
    | "loading_started"
    | "loading_completed"
    | "loading_failed"
    | "unloaded";
  model_id: string | null;
  model_name: string | null;
  error: string | null;
};

export type AudioDeviceInfo = {
  id: string;
  name: string;
  is_default: boolean;
};

export const DEFAULT_STT_CONFIG: SttConfig = {
  enabled: false,
  model_id: "moonshine-base",
  language: "auto",
  vad_threshold: 0.3,
  filter_filler_words: true,
  custom_words: [],
  idle_unload_minutes: 5,
  insert_mode: "cursor",
  streaming_enabled: true,
  ai_cleanup_enabled: false,
  ai_cleanup_prompt:
    "Clean up this dictated text. Fix grammar, remove filler words, maintain the speaker's intent and tone.",
};
