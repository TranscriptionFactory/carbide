use anyhow::Result;
use serde::Serialize;
use specta::Type;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter};
use transcribe_rs::{
    onnx::{
        canary::CanaryModel,
        gigaam::GigaAMModel,
        moonshine::{MoonshineModel, MoonshineVariant, StreamingModel},
        parakeet::{ParakeetModel, ParakeetParams, TimestampGranularity},
        sense_voice::{SenseVoiceModel, SenseVoiceParams},
        Quantization,
    },
    whisper_cpp::{WhisperEngine, WhisperInferenceParams},
    SpeechModel, TranscribeOptions,
};

use super::models::{EngineType, ModelManager};
use super::text;

#[derive(Clone, Debug, Serialize, Type)]
pub struct ModelStateEvent {
    pub event_type: String,
    pub model_id: Option<String>,
    pub model_name: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ModelUnloadTimeout {
    Immediately,
    Minutes(u32),
    Never,
}

impl Default for ModelUnloadTimeout {
    fn default() -> Self {
        Self::Minutes(5)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct TranscriptionResult {
    pub text: String,
    pub language: Option<String>,
    pub duration_ms: u64,
    pub model_id: String,
}

use serde::Deserialize;

enum LoadedEngine {
    Whisper(WhisperEngine),
    Parakeet(ParakeetModel),
    Moonshine(MoonshineModel),
    MoonshineStreaming(StreamingModel),
    SenseVoice(SenseVoiceModel),
    GigaAM(GigaAMModel),
    Canary(CanaryModel),
}

struct LoadingGuard {
    is_loading: Arc<Mutex<bool>>,
    loading_condvar: Arc<Condvar>,
}

impl Drop for LoadingGuard {
    fn drop(&mut self) {
        let mut is_loading = self.is_loading.lock().unwrap();
        *is_loading = false;
        self.loading_condvar.notify_all();
    }
}

pub struct SttTranscriptionState {
    engine: Arc<Mutex<Option<LoadedEngine>>>,
    model_manager: Arc<ModelManager>,
    app_handle: AppHandle,
    current_model_id: Arc<Mutex<Option<String>>>,
    last_activity: Arc<AtomicU64>,
    shutdown_signal: Arc<AtomicBool>,
    watcher_handle: Arc<Mutex<Option<std::thread::JoinHandle<()>>>>,
    is_loading: Arc<Mutex<bool>>,
    loading_condvar: Arc<Condvar>,
    unload_timeout: Arc<Mutex<ModelUnloadTimeout>>,
    custom_words: Arc<Mutex<Vec<String>>>,
    language: Arc<Mutex<String>>,
    filter_fillers: Arc<AtomicBool>,
    translate_to_english: Arc<AtomicBool>,
}

impl SttTranscriptionState {
    pub fn new(app_handle: &AppHandle, model_manager: Arc<ModelManager>) -> Result<Self> {
        let state = Self {
            engine: Arc::new(Mutex::new(None)),
            model_manager,
            app_handle: app_handle.clone(),
            current_model_id: Arc::new(Mutex::new(None)),
            last_activity: Arc::new(AtomicU64::new(0)),
            shutdown_signal: Arc::new(AtomicBool::new(false)),
            watcher_handle: Arc::new(Mutex::new(None)),
            is_loading: Arc::new(Mutex::new(false)),
            loading_condvar: Arc::new(Condvar::new()),
            unload_timeout: Arc::new(Mutex::new(ModelUnloadTimeout::default())),
            custom_words: Arc::new(Mutex::new(Vec::new())),
            language: Arc::new(Mutex::new("auto".to_string())),
            filter_fillers: Arc::new(AtomicBool::new(true)),
            translate_to_english: Arc::new(AtomicBool::new(false)),
        };

        state.start_idle_watcher();
        Ok(state)
    }

    fn touch_activity(&self) {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        self.last_activity.store(now, Ordering::Relaxed);
    }

    fn emit_model_state(&self, event_type: &str, model_id: Option<&str>, error: Option<&str>) {
        let event = ModelStateEvent {
            event_type: event_type.to_string(),
            model_id: model_id.map(|s| s.to_string()),
            model_name: model_id
                .and_then(|id| self.model_manager.get_model_info(id))
                .map(|m| m.name),
            error: error.map(|s| s.to_string()),
        };
        let _ = self.app_handle.emit("stt_model_state", &event);
    }

    fn lock_engine(&self) -> std::sync::MutexGuard<'_, Option<LoadedEngine>> {
        self.engine.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn load_model(&self, model_id: &str) -> Result<()> {
        {
            let mut is_loading = self.is_loading.lock().unwrap();
            if *is_loading {
                anyhow::bail!("Another model is currently loading");
            }
            *is_loading = true;
        }

        let _guard = LoadingGuard {
            is_loading: self.is_loading.clone(),
            loading_condvar: self.loading_condvar.clone(),
        };

        self.emit_model_state("loading_started", Some(model_id), None);

        let model_path = self.model_manager.get_model_path(model_id)?;
        let model_info = self
            .model_manager
            .get_model_info(model_id)
            .ok_or_else(|| anyhow::anyhow!("Model not found: {}", model_id))?;

        let emit_loading_failed = |msg: &str| {
            self.emit_model_state("loading_failed", Some(model_id), Some(msg));
        };

        let loaded_engine = match model_info.engine_type {
            EngineType::Whisper => {
                let engine = WhisperEngine::load(&model_path).map_err(|e| {
                    let msg = format!("Failed to load Whisper model {}: {}", model_id, e);
                    emit_loading_failed(&msg);
                    anyhow::anyhow!(msg)
                })?;
                LoadedEngine::Whisper(engine)
            }
            EngineType::Parakeet => {
                let engine =
                    ParakeetModel::load(&model_path, &Quantization::Int8).map_err(|e| {
                        let msg = format!("Failed to load Parakeet model {}: {}", model_id, e);
                        emit_loading_failed(&msg);
                        anyhow::anyhow!(msg)
                    })?;
                LoadedEngine::Parakeet(engine)
            }
            EngineType::Moonshine => {
                let engine = MoonshineModel::load(
                    &model_path,
                    MoonshineVariant::Base,
                    &Quantization::default(),
                )
                .map_err(|e| {
                    let msg = format!("Failed to load Moonshine model {}: {}", model_id, e);
                    emit_loading_failed(&msg);
                    anyhow::anyhow!(msg)
                })?;
                LoadedEngine::Moonshine(engine)
            }
            EngineType::MoonshineStreaming => {
                let engine =
                    StreamingModel::load(&model_path, 0, &Quantization::default()).map_err(|e| {
                        let msg = format!(
                            "Failed to load MoonshineStreaming model {}: {}",
                            model_id, e
                        );
                        emit_loading_failed(&msg);
                        anyhow::anyhow!(msg)
                    })?;
                LoadedEngine::MoonshineStreaming(engine)
            }
            EngineType::SenseVoice => {
                let engine =
                    SenseVoiceModel::load(&model_path, &Quantization::Int8).map_err(|e| {
                        let msg = format!("Failed to load SenseVoice model {}: {}", model_id, e);
                        emit_loading_failed(&msg);
                        anyhow::anyhow!(msg)
                    })?;
                LoadedEngine::SenseVoice(engine)
            }
            EngineType::GigaAM => {
                let engine =
                    GigaAMModel::load(&model_path, &Quantization::Int8).map_err(|e| {
                        let msg = format!("Failed to load GigaAM model {}: {}", model_id, e);
                        emit_loading_failed(&msg);
                        anyhow::anyhow!(msg)
                    })?;
                LoadedEngine::GigaAM(engine)
            }
            EngineType::Canary => {
                let engine =
                    CanaryModel::load(&model_path, &Quantization::Int8).map_err(|e| {
                        let msg = format!("Failed to load Canary model {}: {}", model_id, e);
                        emit_loading_failed(&msg);
                        anyhow::anyhow!(msg)
                    })?;
                LoadedEngine::Canary(engine)
            }
        };

        {
            let mut engine_guard = self.lock_engine();
            *engine_guard = Some(loaded_engine);
        }

        {
            let mut current = self.current_model_id.lock().unwrap();
            *current = Some(model_id.to_string());
        }

        self.touch_activity();
        self.emit_model_state("loading_completed", Some(model_id), None);
        log::info!("Loaded STT model: {} ({:?})", model_id, model_info.engine_type);
        Ok(())
    }

    pub fn unload_model(&self) -> Result<()> {
        let model_id = {
            let mut current = self.current_model_id.lock().unwrap();
            current.take()
        };

        {
            let mut engine_guard = self.lock_engine();
            *engine_guard = None;
        }

        if let Some(id) = &model_id {
            log::info!("Unloaded STT model: {}", id);
            self.emit_model_state("unloaded", Some(id), None);
        }

        Ok(())
    }

    pub fn transcribe(
        &self,
        audio: Vec<f32>,
        language: Option<String>,
    ) -> Result<TranscriptionResult> {
        if audio.is_empty() {
            anyhow::bail!("No audio data provided");
        }

        // Wait if model is currently loading
        {
            let mut is_loading = self.is_loading.lock().unwrap();
            while *is_loading {
                is_loading = self
                    .loading_condvar
                    .wait_timeout(is_loading, Duration::from_secs(30))
                    .unwrap()
                    .0;
            }
        }

        let model_id = {
            let current = self.current_model_id.lock().unwrap();
            current
                .clone()
                .ok_or_else(|| anyhow::anyhow!("No model loaded"))?
        };

        let model_info = self.model_manager.get_model_info(&model_id);
        let is_whisper = model_info
            .as_ref()
            .map(|m| matches!(m.engine_type, EngineType::Whisper))
            .unwrap_or(false);

        self.touch_activity();
        let start = std::time::Instant::now();

        let validated_language = language
            .or_else(|| {
                let l = self.language.lock().unwrap();
                if l.as_str() == "auto" {
                    None
                } else {
                    Some(l.clone())
                }
            })
            .unwrap_or_else(|| "auto".to_string());

        let custom_words = self.custom_words.lock().unwrap().clone();
        let translate = self.translate_to_english.load(Ordering::Relaxed);

        // Take engine out of mutex for transcription (panic safety)
        let result = {
            let mut engine_guard = self.lock_engine();
            let mut engine = match engine_guard.take() {
                Some(e) => e,
                None => {
                    anyhow::bail!(
                        "No engine loaded. Please check your model settings."
                    );
                }
            };
            drop(engine_guard);

            let transcribe_result = catch_unwind(AssertUnwindSafe(
                || -> Result<transcribe_rs::TranscriptionResult> {
                    match &mut engine {
                        LoadedEngine::Whisper(whisper_engine) => {
                            let whisper_language = if validated_language == "auto" {
                                None
                            } else {
                                let normalized =
                                    if validated_language == "zh-Hans" || validated_language == "zh-Hant" {
                                        "zh".to_string()
                                    } else {
                                        validated_language.clone()
                                    };
                                Some(normalized)
                            };

                            let params = WhisperInferenceParams {
                                language: whisper_language,
                                translate,
                                initial_prompt: if custom_words.is_empty() {
                                    None
                                } else {
                                    Some(custom_words.join(", "))
                                },
                                ..Default::default()
                            };

                            whisper_engine
                                .transcribe_with(&audio, &params)
                                .map_err(|e| anyhow::anyhow!("Whisper transcription failed: {}", e))
                        }
                        LoadedEngine::Parakeet(parakeet_engine) => {
                            let params = ParakeetParams {
                                timestamp_granularity: Some(TimestampGranularity::Segment),
                                ..Default::default()
                            };
                            parakeet_engine
                                .transcribe_with(&audio, &params)
                                .map_err(|e| anyhow::anyhow!("Parakeet transcription failed: {}", e))
                        }
                        LoadedEngine::Moonshine(moonshine_engine) => moonshine_engine
                            .transcribe(&audio, &TranscribeOptions::default())
                            .map_err(|e| anyhow::anyhow!("Moonshine transcription failed: {}", e)),
                        LoadedEngine::MoonshineStreaming(streaming_engine) => streaming_engine
                            .transcribe(&audio, &TranscribeOptions::default())
                            .map_err(|e| {
                                anyhow::anyhow!("Moonshine streaming transcription failed: {}", e)
                            }),
                        LoadedEngine::SenseVoice(sense_voice_engine) => {
                            let language = match validated_language.as_str() {
                                "zh" | "zh-Hans" | "zh-Hant" => Some("zh".to_string()),
                                "en" => Some("en".to_string()),
                                "ja" => Some("ja".to_string()),
                                "ko" => Some("ko".to_string()),
                                "yue" => Some("yue".to_string()),
                                _ => None,
                            };
                            let params = SenseVoiceParams {
                                language,
                                use_itn: Some(true),
                            };
                            sense_voice_engine
                                .transcribe_with(&audio, &params)
                                .map_err(|e| {
                                    anyhow::anyhow!("SenseVoice transcription failed: {}", e)
                                })
                        }
                        LoadedEngine::GigaAM(gigaam_engine) => gigaam_engine
                            .transcribe(&audio, &TranscribeOptions::default())
                            .map_err(|e| anyhow::anyhow!("GigaAM transcription failed: {}", e)),
                        LoadedEngine::Canary(canary_engine) => {
                            let lang = if validated_language == "auto" {
                                None
                            } else {
                                Some(validated_language.clone())
                            };
                            let options = TranscribeOptions {
                                language: lang,
                                translate,
                                leading_silence_ms: None,
                                trailing_silence_ms: None,
                            };
                            canary_engine
                                .transcribe(&audio, &options)
                                .map_err(|e| anyhow::anyhow!("Canary transcription failed: {}", e))
                        }
                    }
                },
            ));

            match transcribe_result {
                Ok(inner_result) => {
                    let mut engine_guard = self.lock_engine();
                    *engine_guard = Some(engine);
                    inner_result?
                }
                Err(panic_payload) => {
                    let panic_msg = if let Some(s) = panic_payload.downcast_ref::<&str>() {
                        s.to_string()
                    } else if let Some(s) = panic_payload.downcast_ref::<String>() {
                        s.clone()
                    } else {
                        "unknown panic".to_string()
                    };
                    log::error!(
                        "Transcription engine panicked: {}. Model has been unloaded.",
                        panic_msg
                    );

                    {
                        let mut current_model =
                            self.current_model_id.lock().unwrap_or_else(|e| e.into_inner());
                        *current_model = None;
                    }

                    self.emit_model_state("unloaded", None, Some(&format!("Engine panicked: {}", panic_msg)));

                    anyhow::bail!(
                        "Transcription engine panicked: {}. The model has been unloaded and will reload on next attempt.",
                        panic_msg
                    );
                }
            }
        };

        let raw_text = result.text;

        // Skip custom word correction for Whisper (already passed as initial_prompt)
        let mut processed_text = if !custom_words.is_empty() && !is_whisper {
            text::apply_custom_words(&raw_text, &custom_words, 0.5)
        } else {
            raw_text
        };

        if self.filter_fillers.load(Ordering::Relaxed) {
            processed_text =
                text::filter_transcription_output(&processed_text, &validated_language, &None);
        }

        let duration_ms = start.elapsed().as_millis() as u64;

        log::info!(
            "Transcription completed in {}ms (model: {})",
            duration_ms,
            model_id
        );

        Ok(TranscriptionResult {
            text: processed_text,
            language: Some(validated_language),
            duration_ms,
            model_id,
        })
    }

    pub fn set_custom_words(&self, words: Vec<String>) {
        *self.custom_words.lock().unwrap() = words;
    }

    pub fn set_language(&self, lang: String) {
        *self.language.lock().unwrap() = lang;
    }

    pub fn set_filter_fillers(&self, enabled: bool) {
        self.filter_fillers.store(enabled, Ordering::Relaxed);
    }

    pub fn set_translate_to_english(&self, enabled: bool) {
        self.translate_to_english.store(enabled, Ordering::Relaxed);
    }

    pub fn set_unload_timeout(&self, timeout: ModelUnloadTimeout) {
        *self.unload_timeout.lock().unwrap() = timeout;
    }

    fn start_idle_watcher(&self) {
        let last_activity = self.last_activity.clone();
        let shutdown_signal = self.shutdown_signal.clone();
        let current_model_id = self.current_model_id.clone();
        let engine = self.engine.clone();
        let unload_timeout = self.unload_timeout.clone();
        let app_handle = self.app_handle.clone();

        let handle = std::thread::spawn(move || {
            loop {
                std::thread::sleep(Duration::from_secs(10));

                if shutdown_signal.load(Ordering::Relaxed) {
                    break;
                }

                let timeout = unload_timeout.lock().unwrap().clone();
                let timeout_secs = match timeout {
                    ModelUnloadTimeout::Immediately => continue,
                    ModelUnloadTimeout::Never => continue,
                    ModelUnloadTimeout::Minutes(m) => m as u64 * 60,
                };

                if current_model_id.lock().unwrap().is_none() {
                    continue;
                }

                let last = last_activity.load(Ordering::Relaxed);
                let now = SystemTime::now()
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                if last > 0 && now - last > timeout_secs {
                    log::info!("STT idle timeout reached, unloading model");

                    {
                        let mut engine_guard =
                            engine.lock().unwrap_or_else(|e| e.into_inner());
                        *engine_guard = None;
                    }

                    let mut current = current_model_id.lock().unwrap();
                    if let Some(id) = current.take() {
                        let event = ModelStateEvent {
                            event_type: "unloaded".to_string(),
                            model_id: Some(id),
                            model_name: None,
                            error: None,
                        };
                        let _ = app_handle.emit("stt_model_state", &event);
                    }
                }
            }
        });

        *self.watcher_handle.lock().unwrap() = Some(handle);
    }
}

impl Drop for SttTranscriptionState {
    fn drop(&mut self) {
        self.shutdown_signal.store(true, Ordering::Relaxed);
        if let Some(handle) = self.watcher_handle.lock().unwrap().take() {
            let _ = handle.join();
        }
    }
}
