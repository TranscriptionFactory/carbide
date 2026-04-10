import type { SttPort } from "$lib/features/stt/ports";
import type { SttStore } from "$lib/features/stt/state/stt_store.svelte";
import type { EditorService } from "$lib/features/editor";
import type { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type {
  SttConfig,
  TranscriptionResult,
} from "$lib/features/stt/types/stt_types";
import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";

const log = create_logger("stt_service");

export class SttService {
  private audio_level_unsub: (() => void) | null = null;
  private recording_state_unsub: (() => void) | null = null;

  constructor(
    private readonly stt_port: SttPort,
    private readonly stt_store: SttStore,
    private readonly editor_service: EditorService,
    private readonly op_store: OpStore,
    private readonly now_ms: () => number,
  ) {}

  async start_recording(): Promise<void> {
    this.op_store.start("stt.record", this.now_ms());
    try {
      this.audio_level_unsub = this.stt_port.subscribe_audio_levels(
        (levels) => {
          this.stt_store.set_audio_levels(levels);
        },
      );

      this.recording_state_unsub = this.stt_port.subscribe_recording_state(
        (state) => {
          this.stt_store.set_recording_state(
            state as "idle" | "recording" | "processing",
          );
        },
      );

      const config = this.stt_store.config;
      await this.stt_port.start_recording(undefined, config.vad_threshold);

      this.stt_store.set_recording_state("recording");
    } catch (error) {
      const msg = error_message(error);
      log.error("Failed to start recording", { error: msg });
      this.op_store.fail("stt.record", msg);
      this.cleanup_subscriptions();
    }
  }

  async stop_and_transcribe(): Promise<TranscriptionResult | null> {
    this.stt_store.set_recording_state("processing");

    try {
      const audio = await this.stt_port.stop_recording();
      this.cleanup_subscriptions();

      if (audio.length === 0) {
        this.stt_store.set_recording_state("idle");
        this.op_store.succeed("stt.record", "No speech detected");
        return null;
      }

      const config = this.stt_store.config;
      const language = config.language === "auto" ? undefined : config.language;

      const result = await this.stt_port.transcribe(audio, language);

      if (result.text.trim()) {
        this.editor_service.insert_text(result.text);
      }

      this.stt_store.set_recording_state("idle");
      this.op_store.succeed("stt.record");
      return result;
    } catch (error) {
      const msg = error_message(error);
      log.error("Transcription failed", { error: msg });
      this.stt_store.set_recording_state("idle");
      this.op_store.fail("stt.record", msg);
      this.cleanup_subscriptions();
      return null;
    }
  }

  async cancel_recording(): Promise<void> {
    try {
      await this.stt_port.cancel_recording();
    } catch (error) {
      log.error("Cancel recording failed", {
        error: error_message(error),
      });
    } finally {
      this.stt_store.set_recording_state("idle");
      this.cleanup_subscriptions();
      this.op_store.succeed("stt.record");
    }
  }

  async toggle_recording(): Promise<TranscriptionResult | null> {
    if (this.stt_store.is_recording) {
      return await this.stop_and_transcribe();
    }
    await this.start_recording();
    return null;
  }

  async refresh_models(): Promise<void> {
    try {
      const models = await this.stt_port.list_models();
      this.stt_store.set_available_models(models);
    } catch (error) {
      log.error("Failed to list models", {
        error: error_message(error),
      });
    }
  }

  async download_model(model_id: string): Promise<void> {
    this.op_store.start("stt.download", this.now_ms());
    try {
      this.stt_store.update_model(model_id, { is_downloading: true });
      await this.stt_port.download_model(model_id);
      this.stt_store.update_model(model_id, {
        is_downloading: false,
        is_downloaded: true,
      });
      this.op_store.succeed("stt.download");
    } catch (error) {
      const msg = error_message(error);
      log.error("Model download failed", { error: msg });
      this.stt_store.update_model(model_id, { is_downloading: false });
      this.op_store.fail("stt.download", msg);
    }
  }

  async delete_model(model_id: string): Promise<void> {
    try {
      await this.stt_port.delete_model(model_id);
      this.stt_store.update_model(model_id, { is_downloaded: false });
      if (this.stt_store.active_model_id === model_id) {
        this.stt_store.set_active_model(null);
      }
    } catch (error) {
      log.error("Model deletion failed", {
        error: error_message(error),
      });
    }
  }

  async select_model(model_id: string): Promise<void> {
    this.op_store.start("stt.load_model", this.now_ms());
    try {
      this.stt_store.set_model_loading(true);
      await this.stt_port.load_model(model_id);
      this.stt_store.set_active_model(model_id);
      this.stt_store.set_model_loading(false);
      this.stt_store.update_config({ model_id });
      this.op_store.succeed("stt.load_model");
    } catch (error) {
      const msg = error_message(error);
      log.error("Model loading failed", { error: msg });
      this.stt_store.set_model_loading(false);
      this.op_store.fail("stt.load_model", msg);
    }
  }

  async transcribe_file(
    file_path: string,
  ): Promise<TranscriptionResult | null> {
    this.op_store.start("stt.transcribe_file", this.now_ms());
    try {
      const config = this.stt_store.config;
      const language = config.language === "auto" ? undefined : config.language;
      const result = await this.stt_port.transcribe_file(file_path, language);
      this.op_store.succeed("stt.transcribe_file");
      return result;
    } catch (error) {
      const msg = error_message(error);
      log.error("File transcription failed", { error: msg });
      this.op_store.fail("stt.transcribe_file", msg);
      return null;
    }
  }

  async update_config(config: Partial<SttConfig>): Promise<void> {
    this.stt_store.update_config(config);
  }

  private cleanup_subscriptions() {
    if (this.audio_level_unsub) {
      this.audio_level_unsub();
      this.audio_level_unsub = null;
    }
    if (this.recording_state_unsub) {
      this.recording_state_unsub();
      this.recording_state_unsub = null;
    }
    this.stt_store.set_audio_levels([]);
  }
}
