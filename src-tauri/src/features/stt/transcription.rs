use anyhow::Result;
use serde::Serialize;
use specta::Type;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter};

use super::models::ModelManager;
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
}

impl SttTranscriptionState {
    pub fn new(app_handle: &AppHandle, model_manager: Arc<ModelManager>) -> Result<Self> {
        let state = Self {
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

        // TODO: Phase 2 — load engine via transcribe-rs based on model_info.engine_type
        // For now, just track the model ID
        log::info!(
            "Model {} ({:?}) at {:?} — engine loading deferred to Phase 2",
            model_id,
            model_info.engine_type,
            model_path
        );

        {
            let mut current = self.current_model_id.lock().unwrap();
            *current = Some(model_id.to_string());
        }

        self.touch_activity();
        self.emit_model_state("loading_completed", Some(model_id), None);
        Ok(())
    }

    pub fn unload_model(&self) -> Result<()> {
        let model_id = {
            let mut current = self.current_model_id.lock().unwrap();
            current.take()
        };

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

        self.touch_activity();
        let start = std::time::Instant::now();

        // TODO: Phase 2 — actual transcription via transcribe-rs engine
        // For now, return a placeholder
        let raw_text = format!(
            "[Transcription placeholder — {} samples, model: {}]",
            audio.len(),
            model_id
        );

        let lang = language
            .or_else(|| {
                let l = self.language.lock().unwrap();
                if l.as_str() == "auto" {
                    None
                } else {
                    Some(l.clone())
                }
            })
            .unwrap_or_else(|| "en".to_string());

        // Apply post-processing
        let custom_words = self.custom_words.lock().unwrap().clone();
        let mut processed_text = if !custom_words.is_empty() {
            text::apply_custom_words(&raw_text, &custom_words, 0.5)
        } else {
            raw_text
        };

        if self.filter_fillers.load(Ordering::Relaxed) {
            processed_text = text::filter_transcription_output(&processed_text, &lang, &None);
        }

        let duration_ms = start.elapsed().as_millis() as u64;

        Ok(TranscriptionResult {
            text: processed_text,
            language: Some(lang),
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

    pub fn set_unload_timeout(&self, timeout: ModelUnloadTimeout) {
        *self.unload_timeout.lock().unwrap() = timeout;
    }

    fn start_idle_watcher(&self) {
        let last_activity = self.last_activity.clone();
        let shutdown_signal = self.shutdown_signal.clone();
        let current_model_id = self.current_model_id.clone();
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
