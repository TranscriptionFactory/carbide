<script lang="ts">
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Switch from "$lib/components/ui/switch/index.js";
  import { Slider } from "$lib/components/ui/slider";
  import { Input } from "$lib/components/ui/input";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";
  import type {
    EditorSettings,
    SttInsertMode,
  } from "$lib/shared/types/editor_settings";
  import type {
    ModelInfo,
    DownloadProgress,
    AudioDeviceInfo,
  } from "$lib/features/stt/types/stt_types";
  import SttModelPicker from "./stt_model_picker.svelte";

  type Props = {
    editor_settings: EditorSettings;
    models: ModelInfo[];
    active_model_id: string | null;
    model_loading: boolean;
    download_progress: DownloadProgress | null;
    audio_devices: AudioDeviceInfo[];
    on_update: <K extends keyof EditorSettings>(
      key: K,
      value: EditorSettings[K],
    ) => void;
    on_download_model: (model_id: string) => void;
    on_delete_model: (model_id: string) => void;
    on_select_model: (model_id: string) => void;
  };

  let {
    editor_settings,
    models,
    active_model_id,
    model_loading,
    download_progress,
    audio_devices,
    on_update,
    on_download_model,
    on_delete_model,
    on_select_model,
  }: Props = $props();

  const stt_disabled = $derived(!editor_settings.stt_enabled);

  const language_options = [
    { value: "auto", label: "Auto-detect" },
    { value: "en", label: "English" },
    { value: "es", label: "Spanish" },
    { value: "fr", label: "French" },
    { value: "de", label: "German" },
    { value: "it", label: "Italian" },
    { value: "pt", label: "Portuguese" },
    { value: "nl", label: "Dutch" },
    { value: "ru", label: "Russian" },
    { value: "zh", label: "Chinese" },
    { value: "ja", label: "Japanese" },
    { value: "ko", label: "Korean" },
    { value: "ar", label: "Arabic" },
    { value: "hi", label: "Hindi" },
    { value: "pl", label: "Polish" },
    { value: "tr", label: "Turkish" },
    { value: "uk", label: "Ukrainian" },
    { value: "sv", label: "Swedish" },
    { value: "da", label: "Danish" },
    { value: "no", label: "Norwegian" },
    { value: "fi", label: "Finnish" },
    { value: "cs", label: "Czech" },
    { value: "el", label: "Greek" },
    { value: "he", label: "Hebrew" },
    { value: "th", label: "Thai" },
    { value: "vi", label: "Vietnamese" },
  ];

  const insert_mode_options: { value: SttInsertMode; label: string }[] = [
    { value: "cursor", label: "At cursor" },
    { value: "new_line", label: "New line" },
    { value: "new_block", label: "New paragraph" },
  ];

  const idle_unload_options = [
    { value: "0", label: "Never" },
    { value: "1", label: "1 min" },
    { value: "2", label: "2 min" },
    { value: "5", label: "5 min" },
    { value: "10", label: "10 min" },
    { value: "15", label: "15 min" },
    { value: "30", label: "30 min" },
  ];
</script>

<div class="SttSettings" class:SttSettings--disabled={stt_disabled}>
  <div class="SettingsDialog__row">
    <div class="SettingsDialog__label-group">
      <span class="SettingsDialog__label">Enable Speech-to-Text</span>
      <span class="SettingsDialog__description">
        Voice dictation and audio transcription
      </span>
    </div>
    <Switch.Root
      checked={editor_settings.stt_enabled}
      onCheckedChange={(v: boolean) => {
        on_update("stt_enabled", v);
      }}
    />
  </div>

  <div class="SettingsDialog__row">
    <div class="SettingsDialog__label-group">
      <span class="SettingsDialog__label">Language</span>
      <span class="SettingsDialog__description">
        Language for transcription
      </span>
    </div>
    <div class="flex items-center gap-3">
      <Select.Root
        type="single"
        disabled={stt_disabled}
        value={editor_settings.stt_language}
        onValueChange={(v: string | undefined) => {
          if (v) on_update("stt_language", v);
        }}
      >
        <Select.Trigger class="w-36">
          <span data-slot="select-value">
            {language_options.find(
              (o) => o.value === editor_settings.stt_language,
            )?.label ?? editor_settings.stt_language}
          </span>
        </Select.Trigger>
        <Select.Content>
          {#each language_options as opt (opt.value)}
            <Select.Item value={opt.value}>{opt.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
      <button
        type="button"
        class="SettingsDialog__reset"
        disabled={stt_disabled ||
          editor_settings.stt_language === DEFAULT_EDITOR_SETTINGS.stt_language}
        onclick={() =>
          on_update("stt_language", DEFAULT_EDITOR_SETTINGS.stt_language)}
        title="Reset to default"
      >
        <RotateCcw />
      </button>
    </div>
  </div>

  <div class="SettingsDialog__row">
    <div class="SettingsDialog__label-group">
      <span class="SettingsDialog__label">Insert Mode</span>
      <span class="SettingsDialog__description">
        Where to insert transcribed text
      </span>
    </div>
    <Select.Root
      type="single"
      disabled={stt_disabled}
      value={editor_settings.stt_insert_mode}
      onValueChange={(v: string | undefined) => {
        if (v) on_update("stt_insert_mode", v as SttInsertMode);
      }}
    >
      <Select.Trigger class="w-36">
        <span data-slot="select-value">
          {insert_mode_options.find(
            (o) => o.value === editor_settings.stt_insert_mode,
          )?.label ?? editor_settings.stt_insert_mode}
        </span>
      </Select.Trigger>
      <Select.Content>
        {#each insert_mode_options as opt (opt.value)}
          <Select.Item value={opt.value}>{opt.label}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>

  <div class="SettingsDialog__row">
    <div class="SettingsDialog__label-group">
      <span class="SettingsDialog__label">VAD Sensitivity</span>
      <span class="SettingsDialog__description">
        Voice activity detection threshold (lower = more sensitive)
      </span>
    </div>
    <div class="flex items-center gap-3">
      <Slider
        type="single"
        disabled={stt_disabled}
        value={editor_settings.stt_vad_threshold}
        onValueChange={(v: number | undefined) => {
          if (v !== undefined) on_update("stt_vad_threshold", v);
        }}
        min={0.1}
        max={0.9}
        step={0.05}
        class="w-32"
      />
      <span class="text-xs text-muted-foreground w-8 text-right">
        {editor_settings.stt_vad_threshold.toFixed(2)}
      </span>
      <button
        type="button"
        class="SettingsDialog__reset"
        disabled={stt_disabled ||
          editor_settings.stt_vad_threshold ===
            DEFAULT_EDITOR_SETTINGS.stt_vad_threshold}
        onclick={() =>
          on_update(
            "stt_vad_threshold",
            DEFAULT_EDITOR_SETTINGS.stt_vad_threshold,
          )}
        title="Reset to default (0.30)"
      >
        <RotateCcw />
      </button>
    </div>
  </div>

  <div class="SettingsDialog__row">
    <div class="SettingsDialog__label-group">
      <span class="SettingsDialog__label">Filter Filler Words</span>
      <span class="SettingsDialog__description">
        Remove "uh", "um", "like" from transcriptions
      </span>
    </div>
    <Switch.Root
      disabled={stt_disabled}
      checked={editor_settings.stt_filter_filler_words}
      onCheckedChange={(v: boolean) => {
        on_update("stt_filter_filler_words", v);
      }}
    />
  </div>

  <div class="SettingsDialog__row">
    <div class="SettingsDialog__label-group">
      <span class="SettingsDialog__label">Streaming</span>
      <span class="SettingsDialog__description">
        Show partial results in real-time (streaming models only)
      </span>
    </div>
    <Switch.Root
      disabled={stt_disabled}
      checked={editor_settings.stt_streaming_enabled}
      onCheckedChange={(v: boolean) => {
        on_update("stt_streaming_enabled", v);
      }}
    />
  </div>

  <div class="SettingsDialog__row">
    <div class="SettingsDialog__label-group">
      <span class="SettingsDialog__label">Idle Unload</span>
      <span class="SettingsDialog__description">
        Unload model from memory after inactivity
      </span>
    </div>
    <Select.Root
      type="single"
      disabled={stt_disabled}
      value={String(editor_settings.stt_idle_unload_minutes)}
      onValueChange={(v: string | undefined) => {
        if (v) on_update("stt_idle_unload_minutes", Number(v));
      }}
    >
      <Select.Trigger class="w-24">
        <span data-slot="select-value">
          {idle_unload_options.find(
            (o) => o.value === String(editor_settings.stt_idle_unload_minutes),
          )?.label ?? `${String(editor_settings.stt_idle_unload_minutes)} min`}
        </span>
      </Select.Trigger>
      <Select.Content>
        {#each idle_unload_options as opt (opt.value)}
          <Select.Item value={opt.value}>{opt.label}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>

  <div class="SettingsDialog__row SttSettings__custom-words">
    <div class="SettingsDialog__label-group">
      <span class="SettingsDialog__label">Custom Words</span>
      <span class="SettingsDialog__description">
        One per line — fuzzy-matched and corrected in transcriptions
      </span>
    </div>
    <textarea
      class="SttSettings__textarea"
      disabled={stt_disabled}
      value={editor_settings.stt_custom_words.join("\n")}
      oninput={(e: Event & { currentTarget: HTMLTextAreaElement }) => {
        const words = e.currentTarget.value
          .split("\n")
          .map((w) => w.trim())
          .filter((w) => w.length > 0);
        on_update("stt_custom_words", words);
      }}
      placeholder="Carbide&#10;ProseMirror&#10;CodeMirror"
      rows={3}
    ></textarea>
  </div>

  <div class="SttSettings__separator"></div>

  <div class="SettingsDialog__row">
    <div class="SettingsDialog__label-group">
      <span class="SettingsDialog__label">AI Cleanup</span>
      <span class="SettingsDialog__description">
        Post-process transcriptions with AI for grammar and formatting
      </span>
    </div>
    <Switch.Root
      disabled={stt_disabled}
      checked={editor_settings.stt_ai_cleanup_enabled}
      onCheckedChange={(v: boolean) => {
        on_update("stt_ai_cleanup_enabled", v);
      }}
    />
  </div>

  {#if editor_settings.stt_ai_cleanup_enabled}
    <div class="SettingsDialog__row SttSettings__custom-words">
      <div class="SettingsDialog__label-group">
        <span class="SettingsDialog__label">AI Cleanup Prompt</span>
        <span class="SettingsDialog__description">
          System prompt for AI post-processing
        </span>
      </div>
      <textarea
        class="SttSettings__textarea"
        disabled={stt_disabled}
        value={editor_settings.stt_ai_cleanup_prompt}
        oninput={(e: Event & { currentTarget: HTMLTextAreaElement }) => {
          on_update("stt_ai_cleanup_prompt", e.currentTarget.value);
        }}
        rows={3}
      ></textarea>
    </div>
  {/if}

  {#if audio_devices.length > 1}
    <div class="SttSettings__separator"></div>

    <div class="SettingsDialog__row">
      <div class="SettingsDialog__label-group">
        <span class="SettingsDialog__label">Audio Device</span>
        <span class="SettingsDialog__description">
          Microphone input device
        </span>
      </div>
      <Select.Root
        type="single"
        disabled={stt_disabled}
        value={audio_devices.find((d) => d.is_default)?.id ?? ""}
      >
        <Select.Trigger class="w-48">
          <span data-slot="select-value">
            {audio_devices.find((d) => d.is_default)?.name ?? "Default"}
          </span>
        </Select.Trigger>
        <Select.Content>
          {#each audio_devices as device (device.id)}
            <Select.Item value={device.id}>{device.name}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
  {/if}

  <div class="SttSettings__separator"></div>

  <div class="SttSettings__model-section">
    <h3 class="SttSettings__section-title">Models</h3>
    <p class="SttSettings__section-description">
      Download and manage speech recognition models. Larger models are more
      accurate but use more memory.
    </p>

    <SttModelPicker
      {models}
      {active_model_id}
      {model_loading}
      {download_progress}
      on_download={on_download_model}
      on_delete={on_delete_model}
      on_select={on_select_model}
    />
  </div>
</div>

<style>
  .SttSettings--disabled > :not(:first-child) {
    opacity: 0.5;
    pointer-events: none;
  }

  .SttSettings__separator {
    border-top: 1px solid var(--color-border);
    margin: var(--spacing-2) 0;
  }

  .SttSettings__textarea {
    width: 100%;
    min-height: 60px;
    padding: var(--spacing-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-input);
    color: var(--color-foreground);
    font-size: var(--text-sm);
    font-family: var(--font-mono);
    resize: vertical;
  }

  .SttSettings__textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .SttSettings__custom-words {
    flex-direction: column;
    align-items: stretch !important;
  }

  .SttSettings__model-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .SttSettings__section-title {
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .SttSettings__section-description {
    font-size: var(--text-xs);
    color: var(--color-muted-foreground);
  }
</style>
