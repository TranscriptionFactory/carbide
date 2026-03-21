pub mod audio;
pub mod types;
pub mod vad;

use std::sync::Mutex;

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Emitter, Manager, State};

use audio::{AudioRecorder, is_microphone_access_denied};
use types::{AudioDeviceInfo, AudioLevelEvent, RecordingState};
use vad::{SileroVad, SmoothedVad};

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

    let vad_path = resource_dir.join("models").join("silero_vad_v4.onnx");
    if !vad_path.exists() {
        return Err(format!(
            "VAD model not found at {}",
            vad_path.display()
        ));
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
    let recorder = recorder_lock
        .as_ref()
        .ok_or("Recorder not initialized")?;

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
    audio::list_input_devices()
}

#[tauri::command]
#[specta::specta]
pub async fn stt_get_recording_state(
    state: State<'_, SttAudioState>,
) -> Result<RecordingState, String> {
    let rec_state = state.recording_state.lock().map_err(|e| e.to_string())?;
    Ok(*rec_state)
}
