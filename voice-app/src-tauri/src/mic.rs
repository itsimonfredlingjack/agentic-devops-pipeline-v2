use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, StreamConfig};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter, State};

pub struct MicState {
    recording: Arc<Mutex<bool>>,
    buffer: Arc<Mutex<Vec<i16>>>,
    stream: Arc<Mutex<Option<cpal::Stream>>>,
    input_sample_rate: Arc<Mutex<u32>>,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
}

impl Default for MicState {
    fn default() -> Self {
        Self {
            recording: Arc::new(Mutex::new(false)),
            buffer: Arc::new(Mutex::new(Vec::new())),
            stream: Arc::new(Mutex::new(None)),
            input_sample_rate: Arc::new(Mutex::new(TARGET_SAMPLE_RATE)),
            app_handle: Arc::new(Mutex::new(None)),
        }
    }
}

// SAFETY: cpal::Stream is Send on all platforms we target.
// The stream is behind Arc<Mutex<>> and only accessed from one thread at a time.
unsafe impl Send for MicState {}
unsafe impl Sync for MicState {}

impl MicState {
    pub fn set_app_handle(&self, handle: AppHandle) {
        if let Ok(mut h) = self.app_handle.lock() {
            *h = Some(handle);
        }
    }
}

const TARGET_SAMPLE_RATE: u32 = 16_000;
const RMS_WINDOW: usize = 800; // ~50ms at 16kHz
const MIN_EMIT_INTERVAL_MS: u128 = 50; // Max 20 events/s

#[derive(Clone, Serialize)]
struct MicLevelPayload {
    rms: f32,
}

fn to_i16(sample: f32) -> i16 {
    (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16
}

fn interleaved_f32_to_mono(data: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return data.iter().map(|s| s.clamp(-1.0, 1.0)).collect();
    }
    data.chunks(channels)
        .map(|frame| {
            let sum: f32 = frame.iter().map(|s| s.clamp(-1.0, 1.0)).sum();
            (sum / channels as f32).clamp(-1.0, 1.0)
        })
        .collect()
}

fn interleaved_i16_to_mono(data: &[i16], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return data
            .iter()
            .map(|s| (*s as f32 / i16::MAX as f32).clamp(-1.0, 1.0))
            .collect();
    }
    data.chunks(channels)
        .map(|frame| {
            let sum: f32 = frame
                .iter()
                .map(|s| (*s as f32 / i16::MAX as f32).clamp(-1.0, 1.0))
                .sum();
            (sum / channels as f32).clamp(-1.0, 1.0)
        })
        .collect()
}

fn interleaved_u16_to_mono(data: &[u16], channels: usize) -> Vec<f32> {
    let to_f32 = |s: u16| ((s as f32 / u16::MAX as f32) * 2.0 - 1.0).clamp(-1.0, 1.0);
    if channels <= 1 {
        return data.iter().map(|s| to_f32(*s)).collect();
    }
    data.chunks(channels)
        .map(|frame| {
            let sum: f32 = frame.iter().map(|s| to_f32(*s)).sum();
            (sum / channels as f32).clamp(-1.0, 1.0)
        })
        .collect()
}

fn handle_mono_samples(
    mono: &[f32],
    buffer: &Arc<Mutex<Vec<i16>>>,
    rms_buffer: &Arc<Mutex<Vec<f32>>>,
    last_emit: &Arc<Mutex<Instant>>,
    app_handle: &Arc<Mutex<Option<AppHandle>>>,
) {
    if mono.is_empty() {
        return;
    }

    if let Ok(mut buf) = buffer.lock() {
        buf.extend(mono.iter().map(|s| to_i16(*s)));
    }

    if let Ok(mut rms_buf) = rms_buffer.lock() {
        rms_buf.extend_from_slice(mono);

        if rms_buf.len() >= RMS_WINDOW {
            let should_emit = last_emit
                .lock()
                .map(|t| t.elapsed().as_millis() >= MIN_EMIT_INTERVAL_MS)
                .unwrap_or(true);

            if should_emit {
                let sum_sq: f32 = rms_buf.iter().map(|&s| s * s).sum();
                let rms = (sum_sq / rms_buf.len() as f32).sqrt();

                if let Ok(handle) = app_handle.lock() {
                    if let Some(ref h) = *handle {
                        let _ = h.emit("mic-level", MicLevelPayload { rms });
                    }
                }

                if let Ok(mut t) = last_emit.lock() {
                    *t = Instant::now();
                }
            }

            rms_buf.clear();
        }
    }
}

fn resample_linear_i16(input: &[i16], input_rate: u32, output_rate: u32) -> Vec<i16> {
    if input.is_empty() || input_rate == output_rate {
        return input.to_vec();
    }

    let step = input_rate as f64 / output_rate as f64;
    let mut pos = 0.0_f64;
    let mut output = Vec::new();

    while (pos as usize) + 1 < input.len() {
        let i = pos.floor() as usize;
        let frac = (pos - i as f64) as f32;
        let a = input[i] as f32;
        let b = input[i + 1] as f32;
        output.push((a + (b - a) * frac).clamp(i16::MIN as f32, i16::MAX as f32) as i16);
        pos += step;
    }

    if output.is_empty() {
        output.push(input[0]);
    }
    output
}

fn build_stream(
    device: &cpal::Device,
    config: &StreamConfig,
    sample_format: SampleFormat,
    buffer: Arc<Mutex<Vec<i16>>>,
    recording_flag: Arc<Mutex<bool>>,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
    rms_buffer: Arc<Mutex<Vec<f32>>>,
    last_emit: Arc<Mutex<Instant>>,
) -> Result<cpal::Stream, String> {
    let channels = config.channels as usize;
    if channels == 0 {
        return Err("Input device reports zero channels".into());
    }

    let err_fn = move |err| {
        eprintln!("Audio stream error: {}", err);
    };

    match sample_format {
        SampleFormat::F32 => device
            .build_input_stream(
                config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    let is_recording = recording_flag.lock().map(|r| *r).unwrap_or(false);
                    if !is_recording {
                        return;
                    }
                    let mono = interleaved_f32_to_mono(data, channels);
                    handle_mono_samples(&mono, &buffer, &rms_buffer, &last_emit, &app_handle);
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("Failed to build input stream: {}", e)),
        SampleFormat::I16 => device
            .build_input_stream(
                config,
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    let is_recording = recording_flag.lock().map(|r| *r).unwrap_or(false);
                    if !is_recording {
                        return;
                    }
                    let mono = interleaved_i16_to_mono(data, channels);
                    handle_mono_samples(&mono, &buffer, &rms_buffer, &last_emit, &app_handle);
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("Failed to build input stream: {}", e)),
        SampleFormat::U16 => device
            .build_input_stream(
                config,
                move |data: &[u16], _: &cpal::InputCallbackInfo| {
                    let is_recording = recording_flag.lock().map(|r| *r).unwrap_or(false);
                    if !is_recording {
                        return;
                    }
                    let mono = interleaved_u16_to_mono(data, channels);
                    handle_mono_samples(&mono, &buffer, &rms_buffer, &last_emit, &app_handle);
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("Failed to build input stream: {}", e)),
        _ => Err(format!("Unsupported sample format: {:?}", sample_format)),
    }
}

#[tauri::command]
pub fn start_mic(state: State<'_, MicState>) -> Result<String, String> {
    let mut recording = state.recording.lock().map_err(|e| e.to_string())?;
    if *recording {
        return Err("Already recording".into());
    }

    // Clear previous buffer
    {
        let mut buf = state.buffer.lock().map_err(|e| e.to_string())?;
        buf.clear();
    }

    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or("No input device available")?;

    let supported_config = device
        .default_input_config()
        .map_err(|e| format!("Failed to get default input config: {}", e))?;
    let sample_format = supported_config.sample_format();
    let config: StreamConfig = supported_config.config();

    {
        let mut sr = state
            .input_sample_rate
            .lock()
            .map_err(|e| e.to_string())?;
        *sr = config.sample_rate.0;
    }

    let buffer = Arc::clone(&state.buffer);
    let recording_flag = Arc::clone(&state.recording);
    let app_handle = Arc::clone(&state.app_handle);

    // State for RMS calculation + throttling
    let rms_buffer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::with_capacity(RMS_WINDOW)));
    let last_emit = Arc::new(Mutex::new(Instant::now()));

    let stream = build_stream(
        &device,
        &config,
        sample_format,
        buffer,
        recording_flag,
        app_handle,
        rms_buffer,
        last_emit,
    )?;

    stream.play().map_err(|e| format!("Failed to start stream: {}", e))?;

    *recording = true;
    let mut stream_holder = state.stream.lock().map_err(|e| e.to_string())?;
    *stream_holder = Some(stream);

    Ok("Recording started".into())
}

#[tauri::command]
pub fn stop_mic(state: State<'_, MicState>) -> Result<Vec<i16>, String> {
    let mut recording = state.recording.lock().map_err(|e| e.to_string())?;
    if !*recording {
        return Err("Not recording".into());
    }

    *recording = false;

    // Drop the stream to stop recording
    {
        let mut stream_holder = state.stream.lock().map_err(|e| e.to_string())?;
        *stream_holder = None;
    }

    let input_rate = *state
        .input_sample_rate
        .lock()
        .map_err(|e| e.to_string())?;
    let buf = state.buffer.lock().map_err(|e| e.to_string())?.clone();

    if input_rate == TARGET_SAMPLE_RATE {
        return Ok(buf);
    }

    Ok(resample_linear_i16(&buf, input_rate, TARGET_SAMPLE_RATE))
}
