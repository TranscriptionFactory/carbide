use crate::features::pipeline::service as pipeline;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

use super::service::{AiProviderConfig, AiTransport};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum AiStreamEvent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "error")]
    Error { error: String },
    #[serde(rename = "done")]
    Done,
}

struct StreamHandle {
    abort_tx: tokio::sync::oneshot::Sender<()>,
}

pub struct AiStreamState {
    handles: Mutex<HashMap<String, StreamHandle>>,
}

impl Default for AiStreamState {
    fn default() -> Self {
        Self {
            handles: Mutex::new(HashMap::new()),
        }
    }
}

fn build_prompt_text(system_prompt: &str, messages: &[AiMessage]) -> String {
    let mut parts = Vec::new();
    if !system_prompt.is_empty() {
        parts.push(format!("<system>\n{system_prompt}\n</system>"));
    }
    for msg in messages {
        parts.push(format!("<{}>\n{}\n</{}>", msg.role, msg.content, msg.role));
    }
    parts.join("\n\n")
}

fn chat_completions_url(base_url: &str) -> String {
    format!("{}/chat/completions", base_url.trim_end_matches('/'))
}

fn build_chat_request_body(
    system_prompt: &str,
    messages: &[AiMessage],
    model: &str,
) -> serde_json::Value {
    let mut msgs: Vec<serde_json::Value> = Vec::new();
    if !system_prompt.is_empty() {
        msgs.push(serde_json::json!({ "role": "system", "content": system_prompt }));
    }
    for msg in messages {
        msgs.push(serde_json::json!({ "role": msg.role, "content": msg.content }));
    }
    serde_json::json!({
        "model": model,
        "messages": msgs,
        "stream": true,
    })
}

#[derive(Deserialize)]
struct ChatChunk {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    #[serde(default)]
    delta: ChatDelta,
}

#[derive(Deserialize, Default)]
struct ChatDelta {
    content: Option<String>,
}

enum SseEvent {
    Delta(String),
    Done,
}

struct SseDecoder {
    buf: Vec<u8>,
}

impl SseDecoder {
    fn new() -> Self {
        Self { buf: Vec::new() }
    }

    fn push(&mut self, bytes: &[u8]) -> Vec<SseEvent> {
        self.buf.extend_from_slice(bytes);
        let mut events = Vec::new();
        while let Some(idx) = self.buf.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = self.buf.drain(..=idx).collect();
            let line = String::from_utf8_lossy(&line_bytes);
            if let Some(event) = parse_sse_line(line.trim_end_matches(['\r', '\n'])) {
                events.push(event);
            }
        }
        events
    }
}

fn parse_sse_line(line: &str) -> Option<SseEvent> {
    let data = line.strip_prefix("data:")?.trim();
    if data.is_empty() {
        return None;
    }
    if data == "[DONE]" {
        return Some(SseEvent::Done);
    }
    let chunk: ChatChunk = serde_json::from_str(data).ok()?;
    let content = chunk.choices.into_iter().next()?.delta.content?;
    Some(SseEvent::Delta(content))
}

#[tauri::command]
#[specta::specta]
pub async fn ai_stream_start(
    app: AppHandle,
    state: tauri::State<'_, AiStreamState>,
    request_id: String,
    provider_config: AiProviderConfig,
    system_prompt: String,
    messages: Vec<AiMessage>,
    model: Option<String>,
) -> Result<(), String> {
    let event_name = format!("ai:chunk:{}", request_id);

    match &provider_config.transport {
        AiTransport::Cli { command, args } => {
            let resolved_model = model
                .or(provider_config.model.clone())
                .unwrap_or_default();
            let prompt_text = build_prompt_text(&system_prompt, &messages);
            let prompt_via_stdin = !args.iter().any(|a| a.contains("{prompt}"));

            let final_args: Vec<String> = args
                .iter()
                .map(|a| {
                    a.replace("{model}", &resolved_model)
                        .replace("{prompt}", &prompt_text)
                })
                .collect();

            let path = pipeline::get_expanded_path();

            let exists = tauri::async_runtime::spawn_blocking({
                let command = command.clone();
                let path = path.clone();
                move || pipeline::check_cli_exists(&command, &path)
            })
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;

            if !exists {
                let _ = app.emit(&event_name, AiStreamEvent::Error {
                    error: format!("{} CLI not found", provider_config.name),
                });
                return Ok(());
            }

            let (abort_tx, abort_rx) = tokio::sync::oneshot::channel::<()>();

            state.handles.lock().await.insert(
                request_id.clone(),
                StreamHandle { abort_tx },
            );

            let command = command.clone();
            let stdin_input = if prompt_via_stdin {
                Some(prompt_text)
            } else {
                None
            };

            tokio::spawn(async move {
                let result = run_streaming_cli(
                    &app,
                    &event_name,
                    &command,
                    &final_args,
                    stdin_input.as_deref(),
                    &path,
                    abort_rx,
                )
                .await;

                if let Err(e) = result {
                    let _ = app.emit(&event_name, AiStreamEvent::Error { error: e });
                }
            });

            Ok(())
        }
        AiTransport::Api {
            base_url,
            api_key_env,
        } => {
            let resolved_model = model
                .or(provider_config.model.clone())
                .unwrap_or_default();
            let url = chat_completions_url(base_url);
            let body = build_chat_request_body(&system_prompt, &messages, &resolved_model);
            let auth_token = api_key_env
                .as_ref()
                .and_then(|name| std::env::var(name).ok())
                .filter(|value| !value.is_empty());

            let (abort_tx, abort_rx) = tokio::sync::oneshot::channel::<()>();
            state.handles.lock().await.insert(
                request_id.clone(),
                StreamHandle { abort_tx },
            );

            tokio::spawn(async move {
                let result =
                    run_streaming_api(&app, &event_name, &url, body, auth_token, abort_rx).await;

                if let Err(e) = result {
                    let _ = app.emit(&event_name, AiStreamEvent::Error { error: e });
                }
            });

            Ok(())
        }
    }
}

async fn run_streaming_api(
    app: &AppHandle,
    event_name: &str,
    url: &str,
    body: serde_json::Value,
    auth_token: Option<String>,
    abort_rx: tokio::sync::oneshot::Receiver<()>,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let mut request = client.post(url).json(&body);
    if let Some(token) = auth_token {
        request = request.bearer_auth(token);
    }

    tokio::select! {
        result = stream_chat_completions(app, event_name, request) => result,
        _ = abort_rx => {
            let _ = app.emit(event_name, AiStreamEvent::Error {
                error: "aborted".to_string(),
            });
            Ok(())
        }
    }
}

async fn stream_chat_completions(
    app: &AppHandle,
    event_name: &str,
    request: reqwest::RequestBuilder,
) -> Result<(), String> {
    let response = request
        .send()
        .await
        .map_err(|e| format!("Could not reach AI server: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let detail = clamp_stderr(&response.text().await.unwrap_or_default());
        let error = if detail.is_empty() {
            format!("AI server returned {status}")
        } else {
            format!("AI server returned {status}: {detail}")
        };
        let _ = app.emit(event_name, AiStreamEvent::Error { error });
        return Ok(());
    }

    let mut stream = response.bytes_stream();
    let mut decoder = SseDecoder::new();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("Stream error: {e}"))?;
        for event in decoder.push(&bytes) {
            match event {
                SseEvent::Delta(text) => {
                    if !text.is_empty() {
                        let _ = app.emit(event_name, AiStreamEvent::Text { text });
                    }
                }
                SseEvent::Done => {
                    let _ = app.emit(event_name, AiStreamEvent::Done);
                    return Ok(());
                }
            }
        }
    }

    let _ = app.emit(event_name, AiStreamEvent::Done);
    Ok(())
}

async fn run_streaming_cli(
    app: &AppHandle,
    event_name: &str,
    command: &str,
    args: &[String],
    stdin_input: Option<&str>,
    path: &str,
    abort_rx: tokio::sync::oneshot::Receiver<()>,
) -> Result<(), String> {
    let mut cmd = Command::new(command);
    cmd.args(args)
        .env("PATH", path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    if stdin_input.is_some() {
        cmd.stdin(std::process::Stdio::piped());
    }

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn {command}: {e}"))?;

    if let Some(input) = stdin_input {
        if let Some(mut stdin) = child.stdin.take() {
            use tokio::io::AsyncWriteExt;
            stdin
                .write_all(input.as_bytes())
                .await
                .map_err(|e| format!("Failed to write stdin: {e}"))?;
            drop(stdin);
        }
    }

    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture stdout")?;

    let stderr_handle = child.stderr.take().map(|stderr| {
        tokio::spawn(async move {
            use tokio::io::AsyncReadExt;
            let mut buf = String::new();
            let _ = BufReader::new(stderr).read_to_string(&mut buf).await;
            buf
        })
    });

    let mut reader = BufReader::new(stdout).lines();

    tokio::select! {
        _ = async {
            while let Ok(Some(line)) = reader.next_line().await {
                let cleaned = pipeline::clean_cli_output(&line);
                if !cleaned.is_empty() {
                    let _ = app.emit(event_name, AiStreamEvent::Text { text: cleaned });
                }
            }

            let status = child.wait().await;
            match status {
                Ok(s) if s.success() => {
                    let _ = app.emit(event_name, AiStreamEvent::Done);
                }
                Ok(s) => {
                    let code = s.code().unwrap_or(-1);
                    let detail = collect_stderr_tail(stderr_handle).await;
                    let error = if detail.is_empty() {
                        format!("Process exited with code {code}")
                    } else {
                        format!("Process exited with code {code}: {detail}")
                    };
                    let _ = app.emit(event_name, AiStreamEvent::Error { error });
                }
                Err(e) => {
                    let _ = app.emit(event_name, AiStreamEvent::Error {
                        error: format!("Process error: {e}"),
                    });
                }
            }
        } => {}
        _ = abort_rx => {
            let _ = child.kill().await;
            let _ = app.emit(event_name, AiStreamEvent::Error {
                error: "aborted".to_string(),
            });
        }
    }

    Ok(())
}

async fn collect_stderr_tail(handle: Option<tokio::task::JoinHandle<String>>) -> String {
    let Some(handle) = handle else {
        return String::new();
    };
    clamp_stderr(&handle.await.unwrap_or_default())
}

fn clamp_stderr(raw: &str) -> String {
    const MAX_CHARS: usize = 800;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() <= MAX_CHARS {
        trimmed.to_string()
    } else {
        let tail: String = chars[chars.len() - MAX_CHARS..].iter().collect();
        format!("…{tail}")
    }
}

#[tauri::command]
#[specta::specta]
pub async fn ai_stream_abort(
    state: tauri::State<'_, AiStreamState>,
    request_id: String,
) -> Result<(), String> {
    if let Some(handle) = state.handles.lock().await.remove(&request_id) {
        let _ = handle.abort_tx.send(());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        build_chat_request_body, chat_completions_url, clamp_stderr, AiMessage, SseDecoder,
        SseEvent,
    };

    fn deltas(events: Vec<SseEvent>) -> Vec<String> {
        events
            .into_iter()
            .filter_map(|e| match e {
                SseEvent::Delta(t) => Some(t),
                SseEvent::Done => None,
            })
            .collect()
    }

    #[test]
    fn chat_url_appends_completions_path() {
        assert_eq!(
            chat_completions_url("http://localhost:1234/v1"),
            "http://localhost:1234/v1/chat/completions"
        );
    }

    #[test]
    fn chat_url_strips_trailing_slash() {
        assert_eq!(
            chat_completions_url("http://localhost:1234/v1/"),
            "http://localhost:1234/v1/chat/completions"
        );
    }

    #[test]
    fn request_body_prepends_system_and_keeps_messages() {
        let msgs = vec![AiMessage {
            role: "user".into(),
            content: "hi".into(),
        }];
        let body = build_chat_request_body("sys", &msgs, "m");
        assert_eq!(body["model"], "m");
        assert_eq!(body["stream"], true);
        let arr = body["messages"].as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["role"], "system");
        assert_eq!(arr[0]["content"], "sys");
        assert_eq!(arr[1]["role"], "user");
        assert_eq!(arr[1]["content"], "hi");
    }

    #[test]
    fn request_body_omits_empty_system() {
        let body = build_chat_request_body("", &[], "m");
        assert_eq!(body["messages"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn decoder_emits_single_delta() {
        let mut d = SseDecoder::new();
        let evs = d.push(b"data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\n\n");
        assert_eq!(deltas(evs), vec!["Hi".to_string()]);
    }

    #[test]
    fn decoder_reassembles_event_split_across_chunks() {
        let mut d = SseDecoder::new();
        assert!(d.push(b"data: {\"choices\":[{\"delta\":{\"con").is_empty());
        let evs = d.push(b"tent\":\"Hi\"}}]}\n");
        assert_eq!(deltas(evs), vec!["Hi".to_string()]);
    }

    #[test]
    fn decoder_yields_multiple_events_in_one_chunk() {
        let mut d = SseDecoder::new();
        let evs = d.push(
            b"data: {\"choices\":[{\"delta\":{\"content\":\"a\"}}]}\ndata: {\"choices\":[{\"delta\":{\"content\":\"b\"}}]}\n",
        );
        assert_eq!(deltas(evs), vec!["a".to_string(), "b".to_string()]);
    }

    #[test]
    fn decoder_emits_done_on_sentinel() {
        let mut d = SseDecoder::new();
        let evs = d.push(b"data: [DONE]\n\n");
        assert!(matches!(evs.as_slice(), [SseEvent::Done]));
    }

    #[test]
    fn decoder_ignores_blank_and_comment_lines() {
        let mut d = SseDecoder::new();
        assert!(d.push(b": ping\n\n").is_empty());
    }

    #[test]
    fn decoder_skips_malformed_json() {
        let mut d = SseDecoder::new();
        assert!(d.push(b"data: {not json}\n").is_empty());
    }

    #[test]
    fn decoder_skips_content_less_delta() {
        let mut d = SseDecoder::new();
        let evs = d.push(b"data: {\"choices\":[{\"delta\":{}}]}\n");
        assert!(deltas(evs).is_empty());
    }

    #[test]
    fn decoder_handles_multibyte_content() {
        let mut d = SseDecoder::new();
        let evs = d.push("data: {\"choices\":[{\"delta\":{\"content\":\"é\"}}]}\n".as_bytes());
        assert_eq!(deltas(evs), vec!["é".to_string()]);
    }

    #[test]
    fn empty_or_whitespace_stderr_yields_nothing() {
        assert_eq!(clamp_stderr(""), "");
        assert_eq!(clamp_stderr("   \n\t "), "");
    }

    #[test]
    fn short_stderr_is_trimmed_and_kept() {
        assert_eq!(
            clamp_stderr("\n  Error: not authenticated\n"),
            "Error: not authenticated"
        );
    }

    #[test]
    fn long_stderr_keeps_a_marked_tail() {
        let raw = "x".repeat(2000);
        let out = clamp_stderr(&raw);
        assert!(out.starts_with('…'));
        assert_eq!(out.chars().count(), 801);
        assert!(out.ends_with('x'));
    }

    #[test]
    fn multibyte_stderr_is_not_split_mid_char() {
        let raw = "é".repeat(2000);
        let out = clamp_stderr(&raw);
        assert!(out.starts_with('…'));
        assert_eq!(out.chars().count(), 801);
    }
}
