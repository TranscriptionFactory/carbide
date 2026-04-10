import type { UIStore } from "$lib/app";
import type { SttStore } from "$lib/features/stt";

export function create_stt_settings_sync_reactor(
  ui_store: UIStore,
  stt_store: SttStore,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      if (!ui_store.editor_settings_loaded) return;

      const s = ui_store.editor_settings;
      stt_store.config = {
        enabled: s.stt_enabled,
        model_id: s.stt_model_id,
        language: s.stt_language,
        vad_threshold: s.stt_vad_threshold,
        filter_filler_words: s.stt_filter_filler_words,
        custom_words: s.stt_custom_words,
        idle_unload_minutes: s.stt_idle_unload_minutes,
        insert_mode: s.stt_insert_mode,
        streaming_enabled: s.stt_streaming_enabled,
        ai_cleanup_enabled: s.stt_ai_cleanup_enabled,
        ai_cleanup_prompt: s.stt_ai_cleanup_prompt,
      };
    });
  });
}
