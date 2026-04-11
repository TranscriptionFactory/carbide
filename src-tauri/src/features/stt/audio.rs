use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    time::Duration,
};

use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    Device, Host, Sample, SizedSample,
};
use rubato::{FftFixedIn, Resampler};
use rustfft::{num_complex::Complex32, Fft, FftPlanner};

use super::types::{AudioDeviceInfo, WHISPER_SAMPLE_RATE};
use super::vad::{VadFrame, VoiceActivityDetector};

// ── CPAL host ───────────────────────────────────────────────────────────────

fn get_cpal_host() -> Host {
    cpal::default_host()
}

// ── Device enumeration ──────────────────────────────────────────────────────

pub fn list_input_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    let host = get_cpal_host();
    let default_name = host.default_input_device().and_then(|d| d.name().ok());

    let devices = host
        .input_devices()
        .map_err(|e| format!("Failed to enumerate input devices: {e}"))?;

    let mut out = Vec::new();
    for (index, device) in devices.enumerate() {
        let name = device.name().unwrap_or_else(|_| "Unknown".into());
        let is_default = Some(&name) == default_name.as_ref();
        out.push(AudioDeviceInfo {
            id: index.to_string(),
            name,
            is_default,
        });
    }
    Ok(out)
}

#[cfg(target_os = "macos")]
pub fn list_input_devices_safe() -> Result<Vec<AudioDeviceInfo>, String> {
    let exe =
        std::env::current_exe().map_err(|e| format!("Failed to get current exe path: {e}"))?;

    let output = std::process::Command::new(&exe)
        .arg("--stt-list-devices")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn device enumeration subprocess: {e}"))?
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for device enumeration subprocess: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::warn!(
            "Device enumeration subprocess failed (status={:?}): {}",
            output.status.code(),
            stderr
        );
        let host = get_cpal_host();
        if let Some(device) = host.default_input_device() {
            let name = device.name().unwrap_or_else(|_| "Default".into());
            return Ok(vec![AudioDeviceInfo {
                id: "0".to_string(),
                name,
                is_default: true,
            }]);
        }
        return Err("Device enumeration crashed and no default device available".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str::<Vec<AudioDeviceInfo>>(&stdout)
        .map_err(|e| format!("Failed to parse device list JSON: {e}"))
}

#[cfg(not(target_os = "macos"))]
pub fn list_input_devices_safe() -> Result<Vec<AudioDeviceInfo>, String> {
    list_input_devices()
}

pub fn run_stt_list_devices() {
    match list_input_devices() {
        Ok(devices) => {
            let json = serde_json::to_string(&devices).unwrap_or_else(|_| "[]".to_string());
            println!("{json}");
        }
        Err(e) => {
            eprintln!("Error listing devices: {e}");
            std::process::exit(1);
        }
    }
}

pub fn find_device_by_name(name: &str) -> Option<Device> {
    let host = get_cpal_host();
    let devices = host.input_devices().ok()?;
    let mut found = None;
    for device in devices {
        let device_name =
            match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| device.name())) {
                Ok(Ok(n)) => n,
                Ok(Err(e)) => {
                    log::warn!("Skipping device with name error: {e}");
                    continue;
                }
                Err(_) => {
                    log::warn!("Skipping device that panicked on .name()");
                    continue;
                }
            };
        if device_name == name {
            found = Some(device);
            break;
        }
    }
    if found.is_none() {
        log::warn!("No audio device found matching name: {name:?}");
    }
    found
}

// ── Frame resampler ─────────────────────────────────────────────────────────

const RESAMPLER_CHUNK_SIZE: usize = 1024;

struct FrameResampler {
    resampler: Option<FftFixedIn<f32>>,
    chunk_in: usize,
    in_buf: Vec<f32>,
    frame_samples: usize,
    pending: Vec<f32>,
}

impl FrameResampler {
    fn new(in_hz: usize, out_hz: usize, frame_dur: Duration) -> Self {
        let frame_samples = ((out_hz as f64 * frame_dur.as_secs_f64()).round()) as usize;
        assert!(frame_samples > 0, "frame duration too short");

        let chunk_in = RESAMPLER_CHUNK_SIZE;
        let resampler = (in_hz != out_hz).then(|| {
            FftFixedIn::<f32>::new(in_hz, out_hz, chunk_in, 1, 1)
                .expect("Failed to create resampler")
        });

        Self {
            resampler,
            chunk_in,
            in_buf: Vec::with_capacity(chunk_in),
            frame_samples,
            pending: Vec::with_capacity(frame_samples),
        }
    }

    fn push(&mut self, mut src: &[f32], mut emit: impl FnMut(&[f32])) {
        if self.resampler.is_none() {
            self.emit_frames(src, &mut emit);
            return;
        }

        while !src.is_empty() {
            let space = self.chunk_in - self.in_buf.len();
            let take = space.min(src.len());
            self.in_buf.extend_from_slice(&src[..take]);
            src = &src[take..];

            if self.in_buf.len() == self.chunk_in {
                if let Ok(out) = self
                    .resampler
                    .as_mut()
                    .unwrap()
                    .process(&[&self.in_buf[..]], None)
                {
                    self.emit_frames(&out[0], &mut emit);
                }
                self.in_buf.clear();
            }
        }
    }

    fn finish(&mut self, mut emit: impl FnMut(&[f32])) {
        if let Some(ref mut resampler) = self.resampler {
            if !self.in_buf.is_empty() {
                self.in_buf.resize(self.chunk_in, 0.0);
                if let Ok(out) = resampler.process(&[&self.in_buf[..]], None) {
                    self.emit_frames(&out[0], &mut emit);
                }
            }
        }

        if !self.pending.is_empty() {
            self.pending.resize(self.frame_samples, 0.0);
            emit(&self.pending);
            self.pending.clear();
        }
    }

    fn emit_frames(&mut self, mut data: &[f32], emit: &mut impl FnMut(&[f32])) {
        while !data.is_empty() {
            let space = self.frame_samples - self.pending.len();
            let take = space.min(data.len());
            self.pending.extend_from_slice(&data[..take]);
            data = &data[take..];

            if self.pending.len() == self.frame_samples {
                emit(&self.pending);
                self.pending.clear();
            }
        }
    }
}

// ── Audio visualizer ────────────────────────────────────────────────────────

const DB_MIN: f32 = -55.0;
const DB_MAX: f32 = -8.0;
const VIS_GAIN: f32 = 1.3;
const CURVE_POWER: f32 = 0.7;

struct AudioVisualiser {
    fft: Arc<dyn Fft<f32>>,
    window: Vec<f32>,
    bucket_ranges: Vec<(usize, usize)>,
    fft_input: Vec<Complex32>,
    noise_floor: Vec<f32>,
    buffer: Vec<f32>,
    window_size: usize,
    buckets: usize,
}

impl AudioVisualiser {
    fn new(
        sample_rate: u32,
        window_size: usize,
        buckets: usize,
        freq_min: f32,
        freq_max: f32,
    ) -> Self {
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(window_size);

        let window: Vec<f32> = (0..window_size)
            .map(|i| {
                0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / window_size as f32).cos())
            })
            .collect();

        let nyquist = sample_rate as f32 / 2.0;
        let freq_min = freq_min.min(nyquist);
        let freq_max = freq_max.min(nyquist);

        let mut bucket_ranges = Vec::with_capacity(buckets);
        for b in 0..buckets {
            let log_start = (b as f32 / buckets as f32).powi(2);
            let log_end = ((b + 1) as f32 / buckets as f32).powi(2);

            let start_hz = freq_min + (freq_max - freq_min) * log_start;
            let end_hz = freq_min + (freq_max - freq_min) * log_end;

            let start_bin = ((start_hz * window_size as f32) / sample_rate as f32) as usize;
            let mut end_bin = ((end_hz * window_size as f32) / sample_rate as f32) as usize;

            if end_bin <= start_bin {
                end_bin = start_bin + 1;
            }

            let start_bin = start_bin.min(window_size / 2);
            let end_bin = end_bin.min(window_size / 2);

            bucket_ranges.push((start_bin, end_bin));
        }

        Self {
            fft,
            window,
            bucket_ranges,
            fft_input: vec![Complex32::new(0.0, 0.0); window_size],
            noise_floor: vec![-40.0; buckets],
            buffer: Vec::with_capacity(window_size * 2),
            window_size,
            buckets,
        }
    }

    fn feed(&mut self, samples: &[f32]) -> Option<Vec<f32>> {
        self.buffer.extend_from_slice(samples);

        if self.buffer.len() < self.window_size {
            return None;
        }

        let window_samples = &self.buffer[..self.window_size];
        let mean = window_samples.iter().sum::<f32>() / self.window_size as f32;

        for (i, &sample) in window_samples.iter().enumerate() {
            let windowed_sample = (sample - mean) * self.window[i];
            self.fft_input[i] = Complex32::new(windowed_sample, 0.0);
        }

        self.fft.process(&mut self.fft_input);

        let mut buckets = vec![0.0; self.buckets];

        for (bucket_idx, &(start_bin, end_bin)) in self.bucket_ranges.iter().enumerate() {
            if start_bin >= end_bin || end_bin > self.fft_input.len() / 2 {
                continue;
            }

            let mut power_sum = 0.0;
            for bin_idx in start_bin..end_bin {
                let magnitude = self.fft_input[bin_idx].norm();
                power_sum += magnitude * magnitude;
            }

            let avg_power = power_sum / (end_bin - start_bin) as f32;

            let db = if avg_power > 1e-12 {
                20.0 * (avg_power.sqrt() / self.window_size as f32).log10()
            } else {
                -80.0
            };

            if db < self.noise_floor[bucket_idx] + 10.0 {
                const NOISE_ALPHA: f32 = 0.001;
                self.noise_floor[bucket_idx] =
                    NOISE_ALPHA * db + (1.0 - NOISE_ALPHA) * self.noise_floor[bucket_idx];
            }

            let normalized = ((db - DB_MIN) / (DB_MAX - DB_MIN)).clamp(0.0, 1.0);
            buckets[bucket_idx] = (normalized * VIS_GAIN).powf(CURVE_POWER).clamp(0.0, 1.0);
        }

        for i in 1..buckets.len() - 1 {
            buckets[i] = buckets[i] * 0.7 + buckets[i - 1] * 0.15 + buckets[i + 1] * 0.15;
        }

        self.buffer.clear();
        Some(buckets)
    }

    fn reset(&mut self) {
        self.buffer.clear();
        self.noise_floor.fill(-40.0);
    }
}

// ── Audio recorder ──────────────────────────────────────────────────────────

enum Cmd {
    Start,
    Stop(mpsc::Sender<Vec<f32>>),
    Shutdown,
}

enum AudioChunk {
    Samples(Vec<f32>),
    EndOfStream,
}

pub struct AudioRecorder {
    device: Option<Device>,
    cmd_tx: Option<mpsc::Sender<Cmd>>,
    worker_handle: Option<std::thread::JoinHandle<()>>,
    vad: Option<Arc<Mutex<Box<dyn VoiceActivityDetector>>>>,
    level_cb: Option<Arc<dyn Fn(Vec<f32>) + Send + Sync + 'static>>,
}

impl AudioRecorder {
    pub fn new() -> Self {
        AudioRecorder {
            device: None,
            cmd_tx: None,
            worker_handle: None,
            vad: None,
            level_cb: None,
        }
    }

    pub fn with_vad(mut self, vad: Box<dyn VoiceActivityDetector>) -> Self {
        self.vad = Some(Arc::new(Mutex::new(vad)));
        self
    }

    pub fn with_level_callback<F>(mut self, cb: F) -> Self
    where
        F: Fn(Vec<f32>) + Send + Sync + 'static,
    {
        self.level_cb = Some(Arc::new(cb));
        self
    }

    pub fn open(&mut self, device: Option<Device>) -> Result<(), String> {
        if self.worker_handle.is_some() {
            return Ok(());
        }

        let (sample_tx, sample_rx) = mpsc::channel::<AudioChunk>();
        let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();
        let (init_tx, init_rx) = mpsc::sync_channel::<Result<(), String>>(1);

        let host = get_cpal_host();
        let device = match device {
            Some(dev) => dev,
            None => host
                .default_input_device()
                .ok_or_else(|| "No input device found".to_string())?,
        };

        let config = get_preferred_config(&device)
            .map_err(|e| format!("Failed to fetch preferred config: {e}"))?;

        let thread_device = device.clone();
        let vad = self.vad.clone();
        let level_cb = self.level_cb.clone();

        let worker = std::thread::spawn(move || {
            let stop_flag = Arc::new(AtomicBool::new(false));
            let stop_flag_for_stream = stop_flag.clone();
            let init_result = (|| -> Result<(cpal::Stream, u32), String> {
                let sample_rate = config.sample_rate().0;
                let channels = config.channels() as usize;

                log::info!(
                    "STT audio device: {:?} rate={} ch={} fmt={:?}",
                    thread_device.name(),
                    sample_rate,
                    channels,
                    config.sample_format()
                );

                let stream = match config.sample_format() {
                    cpal::SampleFormat::U8 => build_stream::<u8>(
                        &thread_device,
                        &config,
                        sample_tx.clone(),
                        channels,
                        stop_flag_for_stream.clone(),
                    ),
                    cpal::SampleFormat::I8 => build_stream::<i8>(
                        &thread_device,
                        &config,
                        sample_tx.clone(),
                        channels,
                        stop_flag_for_stream.clone(),
                    ),
                    cpal::SampleFormat::I16 => build_stream::<i16>(
                        &thread_device,
                        &config,
                        sample_tx.clone(),
                        channels,
                        stop_flag_for_stream.clone(),
                    ),
                    cpal::SampleFormat::I32 => build_stream::<i32>(
                        &thread_device,
                        &config,
                        sample_tx.clone(),
                        channels,
                        stop_flag_for_stream.clone(),
                    ),
                    cpal::SampleFormat::F32 => build_stream::<f32>(
                        &thread_device,
                        &config,
                        sample_tx.clone(),
                        channels,
                        stop_flag_for_stream.clone(),
                    ),
                    fmt => return Err(format!("Unsupported sample format: {fmt:?}")),
                }
                .map_err(|e| format!("Failed to build input stream: {e}"))?;

                stream
                    .play()
                    .map_err(|e| format!("Failed to start microphone stream: {e}"))?;

                Ok((stream, sample_rate))
            })();

            match init_result {
                Ok((stream, sample_rate)) => {
                    let _ = init_tx.send(Ok(()));
                    run_consumer(sample_rate, vad, sample_rx, cmd_rx, level_cb, stop_flag);
                    drop(stream);
                }
                Err(error_message) => {
                    log::error!("STT audio init failed: {error_message}");
                    let _ = init_tx.send(Err(error_message));
                }
            }
        });

        match init_rx.recv() {
            Ok(Ok(())) => {
                self.device = Some(device);
                self.cmd_tx = Some(cmd_tx);
                self.worker_handle = Some(worker);
                Ok(())
            }
            Ok(Err(error_message)) => {
                let _ = worker.join();
                Err(error_message)
            }
            Err(recv_error) => {
                let _ = worker.join();
                Err(format!(
                    "Failed to initialize microphone worker: {recv_error}"
                ))
            }
        }
    }

    pub fn start(&self) -> Result<(), String> {
        if let Some(tx) = &self.cmd_tx {
            tx.send(Cmd::Start).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn stop(&self) -> Result<Vec<f32>, String> {
        let (resp_tx, resp_rx) = mpsc::channel();
        if let Some(tx) = &self.cmd_tx {
            tx.send(Cmd::Stop(resp_tx)).map_err(|e| e.to_string())?;
        }
        resp_rx.recv().map_err(|e| e.to_string())
    }

    pub fn close(&mut self) {
        if let Some(tx) = self.cmd_tx.take() {
            let _ = tx.send(Cmd::Shutdown);
        }
        if let Some(h) = self.worker_handle.take() {
            let _ = h.join();
        }
        self.device = None;
    }
}

impl Drop for AudioRecorder {
    fn drop(&mut self) {
        self.close();
    }
}

pub fn is_microphone_access_denied(error_message: &str) -> bool {
    let normalized = error_message.to_lowercase();
    normalized.contains("access is denied")
        || normalized.contains("permission denied")
        || normalized.contains("0x80070005")
}

// ── Stream builder ──────────────────────────────────────────────────────────

fn build_stream<T>(
    device: &cpal::Device,
    config: &cpal::SupportedStreamConfig,
    sample_tx: mpsc::Sender<AudioChunk>,
    channels: usize,
    stop_flag: Arc<AtomicBool>,
) -> Result<cpal::Stream, cpal::BuildStreamError>
where
    T: Sample + SizedSample + Send + 'static,
    f32: cpal::FromSample<T>,
{
    let mut output_buffer = Vec::new();
    let mut eos_sent = false;

    let stream_cb = move |data: &[T], _: &cpal::InputCallbackInfo| {
        if stop_flag.load(Ordering::Relaxed) {
            if !eos_sent {
                let _ = sample_tx.send(AudioChunk::EndOfStream);
                eos_sent = true;
            }
            return;
        }
        eos_sent = false;

        output_buffer.clear();

        if channels == 1 {
            output_buffer.extend(data.iter().map(|&sample| sample.to_sample::<f32>()));
        } else {
            let frame_count = data.len() / channels;
            output_buffer.reserve(frame_count);
            for frame in data.chunks_exact(channels) {
                let mono_sample = frame
                    .iter()
                    .map(|&sample| sample.to_sample::<f32>())
                    .sum::<f32>()
                    / channels as f32;
                output_buffer.push(mono_sample);
            }
        }

        if sample_tx
            .send(AudioChunk::Samples(output_buffer.clone()))
            .is_err()
        {
            log::error!("STT: Failed to send audio samples");
        }
    };

    device.build_input_stream(
        &config.clone().into(),
        stream_cb,
        |err| log::error!("STT stream error: {}", err),
        None,
    )
}

fn get_preferred_config(device: &cpal::Device) -> Result<cpal::SupportedStreamConfig, String> {
    device
        .default_input_config()
        .map_err(|e| format!("Failed to get default input config: {e}"))
}

// ── Consumer loop ───────────────────────────────────────────────────────────

fn run_consumer(
    in_sample_rate: u32,
    vad: Option<Arc<Mutex<Box<dyn VoiceActivityDetector>>>>,
    sample_rx: mpsc::Receiver<AudioChunk>,
    cmd_rx: mpsc::Receiver<Cmd>,
    level_cb: Option<Arc<dyn Fn(Vec<f32>) + Send + Sync + 'static>>,
    stop_flag: Arc<AtomicBool>,
) {
    let mut frame_resampler = FrameResampler::new(
        in_sample_rate as usize,
        WHISPER_SAMPLE_RATE as usize,
        Duration::from_millis(30),
    );

    let mut processed_samples = Vec::<f32>::new();
    let mut recording = false;

    const BUCKETS: usize = 16;
    const WINDOW_SIZE: usize = 512;
    let mut visualizer = AudioVisualiser::new(in_sample_rate, WINDOW_SIZE, BUCKETS, 400.0, 4000.0);

    fn handle_frame(
        samples: &[f32],
        recording: bool,
        vad: &Option<Arc<Mutex<Box<dyn VoiceActivityDetector>>>>,
        out_buf: &mut Vec<f32>,
    ) {
        if !recording {
            return;
        }

        if let Some(vad_arc) = vad {
            let mut det = vad_arc.lock().unwrap();
            match det.push_frame(samples).unwrap_or(VadFrame::Speech(samples)) {
                VadFrame::Speech(buf) => out_buf.extend_from_slice(buf),
                VadFrame::Noise => {}
            }
        } else {
            out_buf.extend_from_slice(samples);
        }
    }

    loop {
        let chunk = match sample_rx.recv() {
            Ok(c) => c,
            Err(_) => break,
        };

        let raw = match chunk {
            AudioChunk::Samples(s) => s,
            AudioChunk::EndOfStream => continue,
        };

        if let Some(buckets) = visualizer.feed(&raw) {
            if let Some(cb) = &level_cb {
                cb(buckets);
            }
        }

        frame_resampler.push(&raw, &mut |frame: &[f32]| {
            handle_frame(frame, recording, &vad, &mut processed_samples)
        });

        while let Ok(cmd) = cmd_rx.try_recv() {
            match cmd {
                Cmd::Start => {
                    stop_flag.store(false, Ordering::Relaxed);
                    processed_samples.clear();
                    recording = true;
                    visualizer.reset();
                    if let Some(v) = &vad {
                        v.lock().unwrap().reset();
                    }
                }
                Cmd::Stop(reply_tx) => {
                    recording = false;
                    stop_flag.store(true, Ordering::Relaxed);

                    loop {
                        match sample_rx.recv_timeout(Duration::from_secs(2)) {
                            Ok(AudioChunk::Samples(remaining)) => {
                                frame_resampler.push(&remaining, &mut |frame: &[f32]| {
                                    handle_frame(frame, true, &vad, &mut processed_samples)
                                });
                            }
                            Ok(AudioChunk::EndOfStream) => break,
                            Err(_) => {
                                log::warn!(
                                    "STT: Timed out waiting for EndOfStream from audio callback"
                                );
                                break;
                            }
                        }
                    }

                    frame_resampler.finish(&mut |frame: &[f32]| {
                        handle_frame(frame, true, &vad, &mut processed_samples)
                    });

                    let _ = reply_tx.send(std::mem::take(&mut processed_samples));
                    stop_flag.store(false, Ordering::Relaxed);
                }
                Cmd::Shutdown => {
                    stop_flag.store(true, Ordering::Relaxed);
                    return;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_access_denied() {
        assert!(is_microphone_access_denied("Access is denied"));
        assert!(is_microphone_access_denied("permission denied"));
        assert!(is_microphone_access_denied("WASAPI error: 0x80070005"));
        assert!(!is_microphone_access_denied("device not found"));
    }

    #[test]
    fn resampler_passthrough_when_same_rate() {
        let mut resampler = FrameResampler::new(16000, 16000, Duration::from_millis(30));
        let mut frames = Vec::new();

        let input: Vec<f32> = (0..960).map(|i| i as f32 / 960.0).collect();
        resampler.push(&input, |frame| frames.push(frame.to_vec()));
        resampler.finish(|frame| frames.push(frame.to_vec()));

        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0].len(), 480);
        assert_eq!(frames[1].len(), 480);
    }

    #[test]
    fn visualiser_returns_none_until_window_filled() {
        let mut vis = AudioVisualiser::new(16000, 512, 16, 400.0, 4000.0);
        let short = vec![0.0; 256];
        assert!(vis.feed(&short).is_none());
    }

    #[test]
    fn visualiser_returns_buckets_when_window_filled() {
        let mut vis = AudioVisualiser::new(16000, 512, 16, 400.0, 4000.0);
        let full = vec![0.0; 512];
        let result = vis.feed(&full);
        assert!(result.is_some());
        assert_eq!(result.unwrap().len(), 16);
    }
}
