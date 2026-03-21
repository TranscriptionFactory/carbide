use serde::{Deserialize, Serialize};
use specta::Type;

pub const WHISPER_SAMPLE_RATE: u32 = 16_000;
pub const SILERO_FRAME_MS: usize = 30;
pub const SILERO_FRAME_SAMPLES: usize =
    (WHISPER_SAMPLE_RATE as usize * SILERO_FRAME_MS) / 1000; // 480

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct AudioLevelEvent {
    pub levels: Vec<f32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum RecordingState {
    #[default]
    Idle,
    Recording,
    Processing,
}
