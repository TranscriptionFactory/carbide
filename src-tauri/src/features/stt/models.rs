use anyhow::Result;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum EngineType {
    Whisper,
    Parakeet,
    Moonshine,
    MoonshineStreaming,
    SenseVoice,
    GigaAM,
    Canary,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub filename: String,
    pub url: Option<String>,
    pub size_mb: u64,
    pub is_downloaded: bool,
    pub is_downloading: bool,
    pub is_directory: bool,
    pub engine_type: EngineType,
    pub accuracy_score: f32,
    pub speed_score: f32,
    pub supports_translation: bool,
    pub is_recommended: bool,
    pub supported_languages: Vec<String>,
    pub supports_language_selection: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DownloadProgress {
    pub model_id: String,
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
}

pub struct ModelManager {
    app_handle: AppHandle,
    models_dir: PathBuf,
    available_models: Mutex<HashMap<String, ModelInfo>>,
    cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl ModelManager {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let models_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| anyhow::anyhow!("Failed to get app data dir: {}", e))?
            .join("models")
            .join("stt");

        if !models_dir.exists() {
            fs::create_dir_all(&models_dir)?;
        }

        let available_models = build_model_catalog();

        let manager = Self {
            app_handle: app_handle.clone(),
            models_dir,
            available_models: Mutex::new(available_models),
            cancel_flags: Arc::new(Mutex::new(HashMap::new())),
        };

        manager.update_download_status()?;
        Ok(manager)
    }

    pub fn get_available_models(&self) -> Vec<ModelInfo> {
        let models = self.available_models.lock().unwrap();
        models.values().cloned().collect()
    }

    pub fn get_model_info(&self, model_id: &str) -> Option<ModelInfo> {
        let models = self.available_models.lock().unwrap();
        models.get(model_id).cloned()
    }

    pub fn get_model_path(&self, model_id: &str) -> Result<PathBuf> {
        let model_info = self
            .get_model_info(model_id)
            .ok_or_else(|| anyhow::anyhow!("Model not found: {}", model_id))?;

        if !model_info.is_downloaded {
            anyhow::bail!("Model not downloaded: {}", model_id);
        }
        if model_info.is_downloading {
            anyhow::bail!("Model is currently downloading: {}", model_id);
        }

        let model_path = self.models_dir.join(&model_info.filename);
        if model_info.is_directory {
            if model_path.exists() && model_path.is_dir() {
                Ok(model_path)
            } else {
                anyhow::bail!("Model directory not found: {}", model_id)
            }
        } else if model_path.exists() {
            Ok(model_path)
        } else {
            anyhow::bail!("Model file not found: {}", model_id)
        }
    }

    fn update_download_status(&self) -> Result<()> {
        let mut models = self.available_models.lock().unwrap();
        for model in models.values_mut() {
            let model_path = self.models_dir.join(&model.filename);
            if model.is_directory {
                model.is_downloaded = model_path.exists() && model_path.is_dir();
            } else {
                model.is_downloaded = model_path.exists();
            }
            model.is_downloading = false;
        }
        Ok(())
    }

    pub async fn download_model(&self, model_id: &str) -> Result<()> {
        let model_info = {
            let models = self.available_models.lock().unwrap();
            models.get(model_id).cloned()
        };

        let model_info =
            model_info.ok_or_else(|| anyhow::anyhow!("Model not found: {}", model_id))?;

        let url = model_info
            .url
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("No download URL for model: {}", model_id))?;

        let model_path = self.models_dir.join(&model_info.filename);
        let partial_path = self
            .models_dir
            .join(format!("{}.partial", &model_info.filename));

        if model_path.exists() {
            if partial_path.exists() {
                let _ = fs::remove_file(&partial_path);
            }
            self.update_download_status()?;
            return Ok(());
        }

        let mut resume_from = if partial_path.exists() {
            partial_path.metadata()?.len()
        } else {
            0
        };

        {
            let mut models = self.available_models.lock().unwrap();
            if let Some(model) = models.get_mut(model_id) {
                model.is_downloading = true;
            }
        }

        let cancel_flag = Arc::new(AtomicBool::new(false));
        {
            let mut flags = self.cancel_flags.lock().unwrap();
            flags.insert(model_id.to_string(), cancel_flag.clone());
        }

        let client = reqwest::Client::new();
        let mut request = client.get(url);
        if resume_from > 0 {
            request = request.header("Range", format!("bytes={}-", resume_from));
        }

        let mut response = request.send().await?;

        if resume_from > 0 && response.status() == reqwest::StatusCode::OK {
            log::warn!("Server doesn't support range requests for {}, restarting", model_id);
            drop(response);
            let _ = fs::remove_file(&partial_path);
            resume_from = 0;
            response = client.get(url).send().await?;
        }

        if !response.status().is_success()
            && response.status() != reqwest::StatusCode::PARTIAL_CONTENT
        {
            self.mark_not_downloading(model_id);
            anyhow::bail!("Download failed: HTTP {}", response.status());
        }

        let total_size = if resume_from > 0 {
            resume_from + response.content_length().unwrap_or(0)
        } else {
            response.content_length().unwrap_or(0)
        };

        let mut downloaded = resume_from;
        let mut stream = response.bytes_stream();

        let mut file = if resume_from > 0 {
            std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&partial_path)?
        } else {
            std::fs::File::create(&partial_path)?
        };

        let mut last_emit = Instant::now();
        let throttle_duration = Duration::from_millis(100);

        while let Some(chunk) = stream.next().await {
            if cancel_flag.load(Ordering::Relaxed) {
                drop(file);
                log::info!("Download cancelled for: {}", model_id);
                self.mark_not_downloading(model_id);
                self.remove_cancel_flag(model_id);
                return Ok(());
            }

            let chunk = chunk.map_err(|e| {
                self.mark_not_downloading(model_id);
                e
            })?;

            file.write_all(&chunk)?;
            downloaded += chunk.len() as u64;

            if last_emit.elapsed() >= throttle_duration {
                let progress = DownloadProgress {
                    model_id: model_id.to_string(),
                    downloaded,
                    total: total_size,
                    percentage: if total_size > 0 {
                        (downloaded as f64 / total_size as f64) * 100.0
                    } else {
                        0.0
                    },
                };
                let _ = self.app_handle.emit("stt_download_progress", &progress);
                last_emit = Instant::now();
            }
        }

        let final_progress = DownloadProgress {
            model_id: model_id.to_string(),
            downloaded,
            total: total_size,
            percentage: 100.0,
        };
        let _ = self.app_handle.emit("stt_download_progress", &final_progress);

        file.flush()?;
        drop(file);

        if model_info.is_directory {
            self.extract_archive(model_id, &partial_path, &model_path)?;
            let _ = fs::remove_file(&partial_path);
        } else {
            fs::rename(&partial_path, &model_path)?;
        }

        {
            let mut models = self.available_models.lock().unwrap();
            if let Some(model) = models.get_mut(model_id) {
                model.is_downloading = false;
                model.is_downloaded = true;
            }
        }
        self.remove_cancel_flag(model_id);

        let _ = self.app_handle.emit("stt_download_complete", model_id);
        log::info!("Downloaded model {} to {:?}", model_id, model_path);
        Ok(())
    }

    pub fn delete_model(&self, model_id: &str) -> Result<()> {
        let model_info = self
            .get_model_info(model_id)
            .ok_or_else(|| anyhow::anyhow!("Model not found: {}", model_id))?;

        let model_path = self.models_dir.join(&model_info.filename);
        let partial_path = self
            .models_dir
            .join(format!("{}.partial", &model_info.filename));

        if model_info.is_directory {
            if model_path.exists() && model_path.is_dir() {
                fs::remove_dir_all(&model_path)?;
            }
        } else if model_path.exists() {
            fs::remove_file(&model_path)?;
        }

        if partial_path.exists() {
            fs::remove_file(&partial_path)?;
        }

        self.update_download_status()?;
        let _ = self.app_handle.emit("stt_model_deleted", model_id);
        Ok(())
    }

    pub fn cancel_download(&self, model_id: &str) -> Result<()> {
        {
            let flags = self.cancel_flags.lock().unwrap();
            if let Some(flag) = flags.get(model_id) {
                flag.store(true, Ordering::Relaxed);
            }
        }
        self.mark_not_downloading(model_id);
        self.update_download_status()?;
        let _ = self.app_handle.emit("stt_download_cancelled", model_id);
        Ok(())
    }

    fn mark_not_downloading(&self, model_id: &str) {
        let mut models = self.available_models.lock().unwrap();
        if let Some(model) = models.get_mut(model_id) {
            model.is_downloading = false;
        }
    }

    fn remove_cancel_flag(&self, model_id: &str) {
        let mut flags = self.cancel_flags.lock().unwrap();
        flags.remove(model_id);
    }

    fn extract_archive(
        &self,
        model_id: &str,
        archive_path: &Path,
        target_dir: &Path,
    ) -> Result<()> {
        log::info!("Extracting archive for model: {}", model_id);

        let temp_dir = target_dir.with_extension("extracting");
        if temp_dir.exists() {
            let _ = fs::remove_dir_all(&temp_dir);
        }
        fs::create_dir_all(&temp_dir)?;

        let tar_gz = fs::File::open(archive_path)?;
        let tar = flate2::read::GzDecoder::new(tar_gz);
        let mut archive = tar::Archive::new(tar);

        archive.unpack(&temp_dir).map_err(|e| {
            let _ = fs::remove_dir_all(&temp_dir);
            anyhow::anyhow!("Failed to extract archive: {}", e)
        })?;

        let extracted_dirs: Vec<_> = fs::read_dir(&temp_dir)?
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
            .collect();

        if extracted_dirs.len() == 1 {
            let source_dir = extracted_dirs[0].path();
            if target_dir.exists() {
                fs::remove_dir_all(target_dir)?;
            }
            fs::rename(&source_dir, target_dir)?;
            let _ = fs::remove_dir_all(&temp_dir);
        } else {
            if target_dir.exists() {
                fs::remove_dir_all(target_dir)?;
            }
            fs::rename(&temp_dir, target_dir)?;
        }

        log::info!("Extracted model: {}", model_id);
        Ok(())
    }
}

fn build_model_catalog() -> HashMap<String, ModelInfo> {
    let mut models = HashMap::new();

    let whisper_languages: Vec<String> = vec![
        "en", "zh", "de", "es", "ru", "ko", "fr", "ja", "pt", "tr", "pl", "ca", "nl", "ar", "sv",
        "it", "id", "hi", "fi", "vi", "he", "uk", "el", "ms", "cs", "ro", "da", "hu", "ta", "no",
        "th", "ur", "hr", "bg", "lt", "la", "mi", "ml", "cy", "sk", "te", "fa", "lv", "bn", "sr",
        "az", "sl", "kn", "et", "mk", "br", "eu", "is", "hy", "ne", "mn", "bs", "kk", "sq", "sw",
        "gl", "mr", "pa", "si", "km", "sn", "yo", "so", "af", "oc", "ka", "be", "tg", "sd", "gu",
        "am", "yi", "lo", "uz", "fo", "ht", "ps", "tk", "nn", "mt", "sa", "lb", "my", "bo", "tl",
        "mg", "as", "tt", "haw", "ln", "ha", "ba", "jw", "su", "yue",
    ]
    .into_iter()
    .map(String::from)
    .collect();

    let eu_languages: Vec<String> = vec![
        "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "it", "lv", "lt",
        "mt", "pl", "pt", "ro", "sk", "sl", "es", "sv", "ru", "uk",
    ]
    .into_iter()
    .map(String::from)
    .collect();

    macro_rules! add_model {
        ($id:expr, $name:expr, $desc:expr, $file:expr, $url:expr, $sz:expr, $dir:expr, $engine:expr, $acc:expr, $spd:expr, $trans:expr, $rec:expr, $langs:expr, $lang_sel:expr) => {
            models.insert(
                $id.to_string(),
                ModelInfo {
                    id: $id.to_string(),
                    name: $name.to_string(),
                    description: $desc.to_string(),
                    filename: $file.to_string(),
                    url: Some($url.to_string()),
                    size_mb: $sz,
                    is_downloaded: false,
                    is_downloading: false,
                    is_directory: $dir,
                    engine_type: $engine,
                    accuracy_score: $acc,
                    speed_score: $spd,
                    supports_translation: $trans,
                    is_recommended: $rec,
                    supported_languages: $langs,
                    supports_language_selection: $lang_sel,
                },
            );
        };
    }

    add_model!("small", "Whisper Small", "Fast and fairly accurate", "ggml-small.bin",
        "https://blob.handy.computer/ggml-small.bin", 487, false, EngineType::Whisper,
        0.60, 0.85, true, false, whisper_languages.clone(), true);

    add_model!("medium", "Whisper Medium", "Good accuracy, medium speed", "whisper-medium-q4_1.bin",
        "https://blob.handy.computer/whisper-medium-q4_1.bin", 492, false, EngineType::Whisper,
        0.75, 0.60, true, false, whisper_languages.clone(), true);

    add_model!("turbo", "Whisper Turbo", "Balanced accuracy and speed", "ggml-large-v3-turbo.bin",
        "https://blob.handy.computer/ggml-large-v3-turbo.bin", 1600, false, EngineType::Whisper,
        0.80, 0.40, false, false, whisper_languages.clone(), true);

    add_model!("large", "Whisper Large", "Highest accuracy, slow", "ggml-large-v3-q5_0.bin",
        "https://blob.handy.computer/ggml-large-v3-q5_0.bin", 1100, false, EngineType::Whisper,
        0.85, 0.30, true, false, whisper_languages, true);

    add_model!("parakeet-tdt-0.6b-v2", "Parakeet V2", "English only, best for English speakers",
        "parakeet-tdt-0.6b-v2-int8", "https://blob.handy.computer/parakeet-v2-int8.tar.gz",
        473, true, EngineType::Parakeet, 0.85, 0.85, false, false, vec!["en".into()], false);

    add_model!("parakeet-tdt-0.6b-v3", "Parakeet V3", "Fast, accurate, 25 European languages",
        "parakeet-tdt-0.6b-v3-int8", "https://blob.handy.computer/parakeet-v3-int8.tar.gz",
        478, true, EngineType::Parakeet, 0.80, 0.85, false, true, eu_languages.clone(), false);

    add_model!("moonshine-base", "Moonshine Base", "Very fast, English only",
        "moonshine-base", "https://blob.handy.computer/moonshine-base.tar.gz",
        58, true, EngineType::Moonshine, 0.70, 0.90, false, false, vec!["en".into()], false);

    add_model!("moonshine-tiny-streaming-en", "Moonshine V2 Tiny", "Ultra-fast streaming, English",
        "moonshine-tiny-streaming-en", "https://blob.handy.computer/moonshine-tiny-streaming-en.tar.gz",
        31, true, EngineType::MoonshineStreaming, 0.55, 0.95, false, false, vec!["en".into()], false);

    add_model!("moonshine-small-streaming-en", "Moonshine V2 Small", "Fast streaming, English",
        "moonshine-small-streaming-en", "https://blob.handy.computer/moonshine-small-streaming-en.tar.gz",
        100, true, EngineType::MoonshineStreaming, 0.65, 0.90, false, false, vec!["en".into()], false);

    add_model!("moonshine-medium-streaming-en", "Moonshine V2 Medium", "High quality streaming, English",
        "moonshine-medium-streaming-en", "https://blob.handy.computer/moonshine-medium-streaming-en.tar.gz",
        192, true, EngineType::MoonshineStreaming, 0.75, 0.80, false, false, vec!["en".into()], false);

    add_model!("sense-voice-int8", "SenseVoice", "Very fast, Chinese/English/Japanese/Korean",
        "sense-voice-int8", "https://blob.handy.computer/sense-voice-int8.tar.gz",
        160, true, EngineType::SenseVoice, 0.65, 0.95, false, false,
        vec!["zh".into(), "en".into(), "yue".into(), "ja".into(), "ko".into()], true);

    add_model!("gigaam-v3-e2e-ctc", "GigaAM v3", "Russian speech recognition",
        "giga-am-v3-int8", "https://blob.handy.computer/giga-am-v3-int8.tar.gz",
        152, true, EngineType::GigaAM, 0.85, 0.75, false, false, vec!["ru".into()], false);

    add_model!("canary-180m-flash", "Canary 180M Flash", "Very fast, en/de/es/fr, translation",
        "canary-180m-flash", "https://blob.handy.computer/canary-180m-flash.tar.gz",
        146, true, EngineType::Canary, 0.75, 0.85, true, false,
        vec!["en".into(), "de".into(), "es".into(), "fr".into()], true);

    add_model!("canary-1b-v2", "Canary 1B v2", "Accurate multilingual, 25 EU languages, translation",
        "canary-1b-v2", "https://blob.handy.computer/canary-1b-v2.tar.gz",
        692, true, EngineType::Canary, 0.85, 0.70, true, false, eu_languages, true);

    models
}
