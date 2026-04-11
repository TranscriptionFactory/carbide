pub mod audio;
pub mod models;
pub mod text;
pub mod transcription;
pub mod types;
pub mod vad;

use std::io::Cursor;
use std::sync::Mutex;

use rodio::Source;
use rubato::{FftFixedIn, Resampler};
use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Emitter, Manager, State};

use audio::{is_microphone_access_denied, AudioRecorder};
use models::ModelInfo;
use transcription::TranscriptionResult;
use types::{AudioDeviceInfo, AudioLevelEvent, RecordingState, WHISPER_SAMPLE_RATE};
use vad::{SileroVad, SmoothedVad};

use std::sync::Arc;

#[derive(Default)]
pub struct SttAudioState {
    recorder: Mutex<Option<AudioRecorder>>,
    recording_state: Mutex<RecordingState>,
}

#[derive(Clone, Serialize, Type)]
struct SttRecordingStateEvent {
    state: RecordingState,
}

fn create_recorder(app: &AppHandle, vad_threshold: f32) -> Result<AudioRecorder, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to resolve resource dir: {e}"))?;

    let vad_path = resource_dir
        .join("resources")
        .join("models")
        .join("silero_vad_v4.onnx");
    if !vad_path.exists() {
        return Err(format!("VAD model not found at {}", vad_path.display()));
    }

    let silero = SileroVad::new(&vad_path, vad_threshold)
        .map_err(|e| format!("Failed to initialize VAD: {e}"))?;

    let smoothed = SmoothedVad::new(Box::new(silero), 15, 15, 2);

    let app_handle = app.clone();
    let recorder = AudioRecorder::new()
        .with_vad(Box::new(smoothed))
        .with_level_callback(move |levels| {
            let _ = app_handle.emit("stt_audio_level", AudioLevelEvent { levels });
        });

    Ok(recorder)
}

fn emit_state(app: &AppHandle, state: RecordingState) {
    let _ = app.emit("stt_recording_state", SttRecordingStateEvent { state });
}

#[tauri::command]
#[specta::specta]
pub async fn stt_start_recording(
    app: AppHandle,
    state: State<'_, SttAudioState>,
    device_name: Option<String>,
    vad_threshold: Option<f32>,
) -> Result<(), String> {
    let mut rec_state = state.recording_state.lock().map_err(|e| e.to_string())?;
    if *rec_state != RecordingState::Idle {
        return Err("Already recording or processing".into());
    }

    let mut recorder_lock = state.recorder.lock().map_err(|e| e.to_string())?;

    if recorder_lock.is_none() {
        let recorder = create_recorder(&app, vad_threshold.unwrap_or(0.3))?;
        *recorder_lock = Some(recorder);
    }

    let recorder = recorder_lock.as_mut().unwrap();

    let device = device_name.and_then(|name| audio::find_device_by_name(&name));

    if let Err(e) = recorder.open(device) {
        if is_microphone_access_denied(&e) {
            return Err("Microphone access denied. Please grant microphone permission in System Preferences > Privacy & Security > Microphone.".into());
        }
        return Err(e);
    }

    recorder.start()?;
    *rec_state = RecordingState::Recording;
    emit_state(&app, RecordingState::Recording);

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn stt_stop_recording(
    app: AppHandle,
    state: State<'_, SttAudioState>,
) -> Result<Vec<f32>, String> {
    let mut rec_state = state.recording_state.lock().map_err(|e| e.to_string())?;
    if *rec_state != RecordingState::Recording {
        return Err("Not currently recording".into());
    }

    *rec_state = RecordingState::Processing;
    emit_state(&app, RecordingState::Processing);

    let recorder_lock = state.recorder.lock().map_err(|e| e.to_string())?;
    let recorder = recorder_lock.as_ref().ok_or("Recorder not initialized")?;

    let samples = recorder.stop()?;

    drop(recorder_lock);
    let mut rec_state = state.recording_state.lock().map_err(|e| e.to_string())?;
    *rec_state = RecordingState::Idle;
    emit_state(&app, RecordingState::Idle);

    Ok(samples)
}

#[tauri::command]
#[specta::specta]
pub async fn stt_cancel_recording(
    app: AppHandle,
    state: State<'_, SttAudioState>,
) -> Result<(), String> {
    let mut rec_state = state.recording_state.lock().map_err(|e| e.to_string())?;
    if *rec_state != RecordingState::Recording {
        return Err("Not currently recording".into());
    }

    let recorder_lock = state.recorder.lock().map_err(|e| e.to_string())?;
    if let Some(recorder) = recorder_lock.as_ref() {
        let _ = recorder.stop();
    }

    *rec_state = RecordingState::Idle;
    emit_state(&app, RecordingState::Idle);

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn stt_list_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    audio::list_input_devices_safe()
}

#[tauri::command]
#[specta::specta]
pub async fn stt_get_recording_state(
    state: State<'_, SttAudioState>,
) -> Result<RecordingState, String> {
    let rec_state = state.recording_state.lock().map_err(|e| e.to_string())?;
    Ok(*rec_state)
}

// ── Model management commands ───────────────────────────────────────────────

pub struct SttModelState {
    pub manager: Arc<models::ModelManager>,
}

#[tauri::command]
#[specta::specta]
pub async fn stt_list_models(state: State<'_, SttModelState>) -> Result<Vec<ModelInfo>, String> {
    Ok(state.manager.get_available_models())
}

#[tauri::command]
#[specta::specta]
pub async fn stt_download_model(
    model_id: String,
    state: State<'_, SttModelState>,
) -> Result<(), String> {
    state
        .manager
        .download_model(&model_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn stt_delete_model(
    model_id: String,
    state: State<'_, SttModelState>,
) -> Result<(), String> {
    state
        .manager
        .delete_model(&model_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn stt_cancel_download(
    model_id: String,
    state: State<'_, SttModelState>,
) -> Result<(), String> {
    state
        .manager
        .cancel_download(&model_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn stt_add_custom_model(
    path: String,
    engine_type: models::EngineType,
    state: State<'_, SttModelState>,
) -> Result<ModelInfo, String> {
    state
        .manager
        .add_custom_model(&path, engine_type)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn stt_remove_custom_model(
    model_id: String,
    state: State<'_, SttModelState>,
) -> Result<(), String> {
    state
        .manager
        .remove_custom_model(&model_id)
        .map_err(|e| e.to_string())
}

// ── Transcription commands ──────────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
pub async fn stt_load_model(
    model_id: String,
    state: State<'_, transcription::SttTranscriptionState>,
) -> Result<(), String> {
    let state = state.inner().clone();
    let handle = tokio::task::spawn_blocking(move || state.load_model(&model_id));
    match tokio::time::timeout(std::time::Duration::from_secs(120), handle).await {
        Ok(Ok(result)) => result.map_err(|e| e.to_string()),
        Ok(Err(join_err)) => Err(format!("Model loading panicked: {join_err}")),
        Err(_) => Err("Model loading timed out after 120 seconds".to_string()),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn stt_unload_model(
    state: State<'_, transcription::SttTranscriptionState>,
) -> Result<(), String> {
    state.unload_model().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn stt_transcribe(
    audio: Vec<f32>,
    language: Option<String>,
    state: State<'_, transcription::SttTranscriptionState>,
) -> Result<TranscriptionResult, String> {
    let state = state.inner().clone();
    let handle = tokio::task::spawn_blocking(move || state.transcribe(audio, language));
    match tokio::time::timeout(std::time::Duration::from_secs(120), handle).await {
        Ok(Ok(result)) => result.map_err(|e| e.to_string()),
        Ok(Err(join_err)) => Err(format!("Transcription task panicked: {join_err}")),
        Err(_) => Err("Transcription timed out after 120 seconds".to_string()),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn stt_transcribe_file(
    file_path: String,
    language: Option<String>,
    transcription_state: State<'_, transcription::SttTranscriptionState>,
) -> Result<TranscriptionResult, String> {
    let bytes = tokio::fs::read(&file_path)
        .await
        .map_err(|e| format!("Failed to read file: {e}"))?;

    let cursor = Cursor::new(bytes);
    let decoder =
        rodio::Decoder::new(cursor).map_err(|e| format!("Failed to decode audio file: {e}"))?;

    let source_sample_rate = decoder.sample_rate() as usize;
    let source_channels = decoder.channels() as usize;

    let raw_samples: Vec<f32> = decoder.collect();

    let mono_samples: Vec<f32> = if source_channels == 1 {
        raw_samples
    } else {
        raw_samples
            .chunks(source_channels)
            .map(|frame| frame.iter().sum::<f32>() / source_channels as f32)
            .collect()
    };

    let target_sample_rate = WHISPER_SAMPLE_RATE as usize;

    let audio = if source_sample_rate != target_sample_rate {
        let chunk_size = 1024;
        let mut resampler =
            FftFixedIn::<f32>::new(source_sample_rate, target_sample_rate, chunk_size, 1, 1)
                .map_err(|e| format!("Failed to create resampler: {e}"))?;

        let mut output = Vec::new();
        let mut pos = 0;

        while pos + chunk_size <= mono_samples.len() {
            let chunk = &mono_samples[pos..pos + chunk_size];
            let out = resampler
                .process(&[chunk], None)
                .map_err(|e| format!("Resampling failed: {e}"))?;
            output.extend_from_slice(&out[0]);
            pos += chunk_size;
        }

        if pos < mono_samples.len() {
            let mut padded = mono_samples[pos..].to_vec();
            padded.resize(chunk_size, 0.0);
            let out = resampler
                .process(&[&padded], None)
                .map_err(|e| format!("Resampling failed: {e}"))?;
            output.extend_from_slice(&out[0]);
        }

        output
    } else {
        mono_samples
    };

    let state = transcription_state.inner().clone();
    let handle = tokio::task::spawn_blocking(move || state.transcribe(audio, language));
    match tokio::time::timeout(std::time::Duration::from_secs(120), handle).await {
        Ok(Ok(result)) => result.map_err(|e| e.to_string()),
        Ok(Err(join_err)) => Err(format!("Transcription task panicked: {join_err}")),
        Err(_) => Err("Transcription timed out after 120 seconds".to_string()),
    }
}
