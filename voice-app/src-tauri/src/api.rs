use hound::{SampleFormat, WavSpec, WavWriter};
use reqwest::multipart;
use reqwest::StatusCode;
use std::io::Cursor;

const SAMPLE_RATE: u32 = 16_000;

fn encode_wav(samples: &[i16]) -> Result<Vec<u8>, String> {
    let spec = WavSpec {
        channels: 1,
        sample_rate: SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
    };

    let mut cursor = Cursor::new(Vec::new());
    {
        let mut writer =
            WavWriter::new(&mut cursor, spec).map_err(|e| format!("WAV write error: {}", e))?;
        for &sample in samples {
            writer
                .write_sample(sample)
                .map_err(|e| format!("WAV sample error: {}", e))?;
        }
        writer
            .finalize()
            .map_err(|e| format!("WAV finalize error: {}", e))?;
    }

    Ok(cursor.into_inner())
}

async fn post_audio(
    client: &reqwest::Client,
    url: &str,
    wav_bytes: &[u8],
) -> Result<reqwest::Response, String> {
    let part = multipart::Part::bytes(wav_bytes.to_vec())
        .file_name("recording.wav")
        .mime_str("audio/wav")
        .map_err(|e| format!("MIME error: {}", e))?;

    let form = multipart::Form::new().part("audio", part);
    client
        .post(url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed for {}: {}", url, e))
}

async fn parse_json_response(
    response: reqwest::Response,
    endpoint_label: &str,
) -> Result<serde_json::Value, String> {
    let mut result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("JSON parse error from {}: {}", endpoint_label, e))?;

    if let Some(obj) = result.as_object_mut() {
        obj.insert(
            "_endpoint_used".to_string(),
            serde_json::Value::String(endpoint_label.to_string()),
        );
    }

    Ok(result)
}

#[tauri::command]
pub async fn send_audio(samples: Vec<i16>, server_url: String) -> Result<serde_json::Value, String> {
    let wav_bytes = encode_wav(&samples)?;
    let base_url = server_url.trim_end_matches('/');
    let pipeline_url = format!("{}/api/pipeline/run/audio", base_url);
    let transcribe_url = format!("{}/api/transcribe", base_url);
    let client = reqwest::Client::new();

    let pipeline_response = post_audio(&client, &pipeline_url, &wav_bytes).await?;

    if pipeline_response.status().is_success() {
        return parse_json_response(pipeline_response, "pipeline_run_audio").await;
    }

    if pipeline_response.status() != StatusCode::NOT_FOUND
        && pipeline_response.status() != StatusCode::METHOD_NOT_ALLOWED
    {
        let status = pipeline_response.status();
        let body = pipeline_response.text().await.unwrap_or_default();
        return Err(format!(
            "Server error {} on /api/pipeline/run/audio: {}",
            status, body
        ));
    }

    let transcribe_response = post_audio(&client, &transcribe_url, &wav_bytes).await?;

    if !transcribe_response.status().is_success() {
        let status = transcribe_response.status();
        let body = transcribe_response.text().await.unwrap_or_default();
        return Err(format!("Server error {}: {}", status, body));
    }

    parse_json_response(transcribe_response, "transcribe_fallback").await
}
