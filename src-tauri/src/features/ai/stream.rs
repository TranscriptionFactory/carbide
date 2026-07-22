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
    pub content: AiMessageContent,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(untagged)]
pub enum AiMessageContent {
    Text(String),
    Parts(Vec<AiContentPart>),
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum AiContentPart {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image")]
    Image { media_type: String, data: String },
}

impl From<String> for AiMessageContent {
    fn from(text: String) -> Self {
        AiMessageContent::Text(text)
    }
}

impl From<&str> for AiMessageContent {
    fn from(text: &str) -> Self {
        AiMessageContent::Text(text.to_string())
    }
}

impl AiMessageContent {
    fn as_prompt_text(&self) -> String {
        match self {
            AiMessageContent::Text(text) => text.clone(),
            AiMessageContent::Parts(parts) => parts
                .iter()
                .map(|part| match part {
                    AiContentPart::Text { text } => text.clone(),
                    AiContentPart::Image { .. } => "[image omitted]".to_string(),
                })
                .collect::<Vec<String>>()
                .join("\n"),
        }
    }

    fn to_chat_content(&self) -> serde_json::Value {
        match self {
            AiMessageContent::Text(text) => serde_json::Value::String(text.clone()),
            AiMessageContent::Parts(parts) => serde_json::Value::Array(
                parts
                    .iter()
                    .map(|part| match part {
                        AiContentPart::Text { text } => {
                            serde_json::json!({ "type": "text", "text": text })
                        }
                        AiContentPart::Image { media_type, data } => serde_json::json!({
                            "type": "image_url",
                            "image_url": { "url": format!("data:{media_type};base64,{data}") },
                        }),
                    })
                    .collect(),
            ),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum AiStreamEvent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "reasoning")]
    Reasoning { text: String },
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
        parts.push(system_prompt.to_string());
    }
    for msg in messages {
        parts.push(msg.content.as_prompt_text());
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
    stream: bool,
) -> serde_json::Value {
    let mut msgs: Vec<serde_json::Value> = Vec::new();
    if !system_prompt.is_empty() {
        msgs.push(serde_json::json!({ "role": "system", "content": system_prompt }));
    }
    for msg in messages {
        msgs.push(serde_json::json!({ "role": msg.role, "content": msg.content.to_chat_content() }));
    }
    serde_json::json!({
        "model": model,
        "messages": msgs,
        "stream": stream,
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
    #[serde(alias = "reasoning")]
    reasoning_content: Option<String>,
}

enum SseEvent {
    Delta(ChatDelta),
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
    let delta = chunk.choices.into_iter().next()?.delta;
    if delta.content.is_none() && delta.reasoning_content.is_none() {
        return None;
    }
    Some(SseEvent::Delta(delta))
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
    vault_path: Option<String>,
) -> Result<(), String> {
    let event_name = format!("ai:chunk:{}", request_id);

    match &provider_config.transport {
        AiTransport::Cli { command, args } => {
            let resolved_model = model.or(provider_config.model.clone()).unwrap_or_default();
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

            let probe = tauri::async_runtime::spawn_blocking({
                let command = command.clone();
                let path = path.clone();
                move || pipeline::resolve_cli_with_path(&command, &path)
            })
            .await
            .map_err(|e| e.to_string())?;

            if probe.status != pipeline::CliProbeStatus::Present {
                let error = match (&probe.status, &probe.error) {
                    (_, Some(detail)) if detail.contains("not executable") => {
                        format!("{}: {}", provider_config.name, detail)
                    }
                    (pipeline::CliProbeStatus::Unknown, _) => format!(
                        "Could not verify the {} CLI — set an absolute command path in AI settings",
                        provider_config.name
                    ),
                    _ => format!("{} CLI not found", provider_config.name),
                };
                let _ = app.emit(&event_name, AiStreamEvent::Error { error });
                return Ok(());
            }

            let (abort_tx, abort_rx) = tokio::sync::oneshot::channel::<()>();

            state
                .handles
                .lock()
                .await
                .insert(request_id.clone(), StreamHandle { abort_tx });

            let path = probe
                .resolved_path
                .as_deref()
                .and_then(|p| std::path::Path::new(p).parent())
                .map(|parent| pipeline::path_with_dir_prepended(parent, &path))
                .unwrap_or(path);
            let command = probe.resolved_path.unwrap_or_else(|| command.clone());
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
                    vault_path.as_deref(),
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
            let resolved_model = model.or(provider_config.model.clone()).unwrap_or_default();
            let url = chat_completions_url(base_url);
            let body = build_chat_request_body(&system_prompt, &messages, &resolved_model, true);
            let auth_token =
                super::secrets::resolve_api_key(&provider_config.id, api_key_env.as_deref());

            let (abort_tx, abort_rx) = tokio::sync::oneshot::channel::<()>();
            state
                .handles
                .lock()
                .await
                .insert(request_id.clone(), StreamHandle { abort_tx });

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

    consume_sse_response(response, &mut |event| {
        let _ = app.emit(event_name, event);
    })
    .await
}

async fn consume_sse_response<F: FnMut(AiStreamEvent)>(
    response: reqwest::Response,
    emit: &mut F,
) -> Result<(), String> {
    if !response.status().is_success() {
        let status = response.status();
        let detail = clamp_stderr(&response.text().await.unwrap_or_default());
        let error = if detail.is_empty() {
            format!("AI server returned {status}")
        } else {
            format!("AI server returned {status}: {detail}")
        };
        emit(AiStreamEvent::Error { error });
        return Ok(());
    }

    let mut stream = response.bytes_stream();
    let mut decoder = SseDecoder::new();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("Stream error: {e}"))?;
        for event in decoder.push(&bytes) {
            match event {
                SseEvent::Delta(delta) => {
                    if let Some(text) = delta.reasoning_content.filter(|t| !t.is_empty()) {
                        emit(AiStreamEvent::Reasoning { text });
                    }
                    if let Some(text) = delta.content.filter(|t| !t.is_empty()) {
                        emit(AiStreamEvent::Text { text });
                    }
                }
                SseEvent::Done => {
                    emit(AiStreamEvent::Done);
                    return Ok(());
                }
            }
        }
    }

    emit(AiStreamEvent::Done);
    Ok(())
}

#[derive(Debug, PartialEq)]
struct ThinkSegment {
    reasoning: bool,
    text: String,
}

struct ThinkScanner {
    in_think: bool,
}

impl ThinkScanner {
    fn new() -> Self {
        Self { in_think: false }
    }

    fn scan_line(&mut self, line: &str) -> Vec<ThinkSegment> {
        let mut segments: Vec<ThinkSegment> = Vec::new();
        let mut push = |reasoning: bool, text: &str| {
            if !text.is_empty() {
                segments.push(ThinkSegment {
                    reasoning,
                    text: text.to_string(),
                });
            }
        };
        let mut rest = line;
        loop {
            if self.in_think {
                match rest.find("</think>") {
                    Some(idx) => {
                        push(true, &rest[..idx]);
                        rest = &rest[idx + "</think>".len()..];
                        self.in_think = false;
                    }
                    None => {
                        push(true, rest);
                        break;
                    }
                }
            } else {
                match rest.find("<think>") {
                    Some(idx) => {
                        push(false, &rest[..idx]);
                        rest = &rest[idx + "<think>".len()..];
                        self.in_think = true;
                    }
                    None => {
                        push(false, rest);
                        break;
                    }
                }
            }
        }
        match segments.last_mut() {
            Some(last) => last.text.push('\n'),
            None => segments.push(ThinkSegment {
                reasoning: self.in_think,
                text: "\n".to_string(),
            }),
        }
        segments
    }
}

async fn run_streaming_cli(
    app: &AppHandle,
    event_name: &str,
    command: &str,
    args: &[String],
    stdin_input: Option<&str>,
    path: &str,
    cwd: Option<&str>,
    abort_rx: tokio::sync::oneshot::Receiver<()>,
) -> Result<(), String> {
    let mut cmd = Command::new(command);
    cmd.args(args)
        .env("PATH", path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    if let Some(dir) = cwd.filter(|d| !d.is_empty()) {
        cmd.current_dir(dir);
    }

    if stdin_input.is_some() {
        cmd.stdin(std::process::Stdio::piped());
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn {command}: {e}"))?;

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

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

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
            let mut scanner = ThinkScanner::new();
            while let Ok(Some(line)) = reader.next_line().await {
                let cleaned = pipeline::clean_cli_output(&line);
                // scan_line re-appends the newline next_line() strips so
                // multi-line CLI replies keep their paragraph structure
                for segment in scanner.scan_line(&cleaned) {
                    let event = if segment.reasoning {
                        AiStreamEvent::Reasoning { text: segment.text }
                    } else {
                        AiStreamEvent::Text { text: segment.text }
                    };
                    let _ = app.emit(event_name, event);
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

pub(crate) async fn collect_stderr_tail(
    handle: Option<tokio::task::JoinHandle<String>>,
) -> String {
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

#[tauri::command]
#[specta::specta]
pub async fn ai_test_provider(provider_config: AiProviderConfig) -> Result<String, String> {
    match &provider_config.transport {
        AiTransport::Cli { command, .. } => {
            let command = command.clone();
            let probe = tauri::async_runtime::spawn_blocking(move || pipeline::probe_cli(&command))
                .await
                .map_err(|e| e.to_string())?;
            match probe.status {
                pipeline::CliProbeStatus::Present => Ok(probe
                    .version
                    .map(|v| format!("CLI found · v{v}"))
                    .unwrap_or_else(|| "CLI found".to_string())),
                _ => Err(probe
                    .error
                    .unwrap_or_else(|| format!("{} CLI not found", provider_config.name))),
            }
        }
        AiTransport::Api {
            base_url,
            api_key_env,
        } => {
            let model = provider_config.model.clone().unwrap_or_default();
            let url = chat_completions_url(base_url);
            let messages = vec![AiMessage {
                role: "user".to_string(),
                content: "Reply with exactly OK.".into(),
            }];
            let mut body = build_chat_request_body("", &messages, &model, false);
            body["max_tokens"] = serde_json::json!(8);
            let auth_token =
                super::secrets::resolve_api_key(&provider_config.id, api_key_env.as_deref());

            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .build()
                .map_err(|e| format!("Failed to build HTTP client: {e}"))?;
            let mut request = client.post(&url).json(&body);
            if let Some(token) = auth_token {
                request = request.bearer_auth(token);
            }

            let response = request
                .send()
                .await
                .map_err(|e| format!("Could not reach AI server: {e}"))?;
            let status = response.status();
            if !status.is_success() {
                let detail = clamp_stderr(&response.text().await.unwrap_or_default());
                return Err(if detail.is_empty() {
                    format!("AI server returned {status}")
                } else {
                    format!("AI server returned {status}: {detail}")
                });
            }
            Ok("OK".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_chat_request_body, build_prompt_text, chat_completions_url, clamp_stderr,
        AiContentPart, AiMessage, AiMessageContent, SseDecoder, SseEvent, ThinkScanner,
        ThinkSegment,
    };

    fn deltas(events: Vec<SseEvent>) -> Vec<String> {
        events
            .into_iter()
            .filter_map(|e| match e {
                SseEvent::Delta(d) => d.content,
                SseEvent::Done => None,
            })
            .collect()
    }

    fn seg(reasoning: bool, text: &str) -> ThinkSegment {
        ThinkSegment {
            reasoning,
            text: text.to_string(),
        }
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
        let body = build_chat_request_body("sys", &msgs, "m", true);
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
        let body = build_chat_request_body("", &[], "m", true);
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
    fn decoder_extracts_reasoning_content_delta() {
        let mut d = SseDecoder::new();
        let evs = d.push(b"data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"hmm\"}}]}\n");
        match evs.as_slice() {
            [SseEvent::Delta(delta)] => {
                assert_eq!(delta.reasoning_content.as_deref(), Some("hmm"));
                assert_eq!(delta.content, None);
            }
            other => panic!("expected one delta, got {} events", other.len()),
        }
    }

    #[test]
    fn decoder_accepts_reasoning_alias() {
        let mut d = SseDecoder::new();
        let evs = d.push(b"data: {\"choices\":[{\"delta\":{\"reasoning\":\"hmm\"}}]}\n");
        match evs.as_slice() {
            [SseEvent::Delta(delta)] => {
                assert_eq!(delta.reasoning_content.as_deref(), Some("hmm"));
            }
            other => panic!("expected one delta, got {} events", other.len()),
        }
    }

    #[test]
    fn decoder_keeps_content_and_reasoning_in_same_delta() {
        let mut d = SseDecoder::new();
        let evs = d.push(
            b"data: {\"choices\":[{\"delta\":{\"content\":\"a\",\"reasoning_content\":\"b\"}}]}\n",
        );
        match evs.as_slice() {
            [SseEvent::Delta(delta)] => {
                assert_eq!(delta.content.as_deref(), Some("a"));
                assert_eq!(delta.reasoning_content.as_deref(), Some("b"));
            }
            other => panic!("expected one delta, got {} events", other.len()),
        }
    }

    #[test]
    fn scanner_passes_through_lines_without_tags() {
        let mut s = ThinkScanner::new();
        assert_eq!(s.scan_line("hello"), vec![seg(false, "hello\n")]);
        assert_eq!(s.scan_line(""), vec![seg(false, "\n")]);
    }

    #[test]
    fn scanner_marks_lines_between_tags_as_reasoning() {
        let mut s = ThinkScanner::new();
        assert_eq!(s.scan_line("<think>"), vec![seg(true, "\n")]);
        assert_eq!(s.scan_line("step one"), vec![seg(true, "step one\n")]);
        assert_eq!(s.scan_line("step two"), vec![seg(true, "step two\n")]);
        assert_eq!(s.scan_line("</think>"), vec![seg(false, "\n")]);
        assert_eq!(s.scan_line("answer"), vec![seg(false, "answer\n")]);
    }

    #[test]
    fn scanner_handles_open_and_close_on_same_line() {
        let mut s = ThinkScanner::new();
        assert_eq!(
            s.scan_line("before <think>hidden</think> after"),
            vec![seg(false, "before "), seg(true, "hidden"), seg(false, " after\n")]
        );
        assert_eq!(s.scan_line("next"), vec![seg(false, "next\n")]);
    }

    #[test]
    fn scanner_keeps_reasoning_open_across_lines_until_close() {
        let mut s = ThinkScanner::new();
        assert_eq!(
            s.scan_line("<think>first half"),
            vec![seg(true, "first half\n")]
        );
        assert_eq!(
            s.scan_line("second half</think>answer"),
            vec![seg(true, "second half"), seg(false, "answer\n")]
        );
    }

    #[test]
    fn scanner_flushes_unclosed_think_as_reasoning_until_eof() {
        let mut s = ThinkScanner::new();
        assert_eq!(s.scan_line("<think>never"), vec![seg(true, "never\n")]);
        assert_eq!(s.scan_line("closed"), vec![seg(true, "closed\n")]);
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

    fn spawn_mock_server(response: String) -> std::net::SocketAddr {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            let (mut conn, _) = listener.accept().unwrap();
            let mut buf = [0u8; 2048];
            let _ = conn.read(&mut buf);
            let _ = conn.write_all(response.as_bytes());
            let _ = conn.flush();
        });
        addr
    }

    #[tokio::test]
    async fn streams_deltas_from_mock_llama_server() {
        let body = concat!(
            "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n",
            "data: [DONE]\n\n",
        );
        let addr = spawn_mock_server(format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n{body}"
        ));

        let response = reqwest::Client::new()
            .post(format!("http://{addr}/v1/chat/completions"))
            .json(&super::build_chat_request_body(
                "sys",
                &[AiMessage {
                    role: "user".into(),
                    content: "hi".into(),
                }],
                "m",
                true,
            ))
            .send()
            .await
            .unwrap();

        let mut events = Vec::new();
        super::consume_sse_response(response, &mut |e| events.push(e))
            .await
            .unwrap();

        let texts: Vec<String> = events
            .iter()
            .filter_map(|e| match e {
                super::AiStreamEvent::Text { text } => Some(text.clone()),
                _ => None,
            })
            .collect();
        assert_eq!(texts, vec!["Hello".to_string(), " world".to_string()]);
        assert!(matches!(events.last(), Some(super::AiStreamEvent::Done)));
    }

    #[tokio::test]
    async fn surfaces_http_error_status_from_mock_server() {
        let addr = spawn_mock_server(
            "HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\nmodel not loaded"
                .to_string(),
        );

        let response = reqwest::Client::new()
            .post(format!("http://{addr}/v1/chat/completions"))
            .send()
            .await
            .unwrap();

        let mut events = Vec::new();
        super::consume_sse_response(response, &mut |e| events.push(e))
            .await
            .unwrap();

        match events.as_slice() {
            [super::AiStreamEvent::Error { error }] => {
                assert!(error.contains("500"), "got: {error}");
                assert!(error.contains("model not loaded"), "got: {error}");
            }
            other => panic!("expected one error event, got {other:?}"),
        }
    }

    #[test]
    fn message_content_deserializes_untagged() {
        let text: AiMessage = serde_json::from_str(r#"{"role":"user","content":"hi"}"#).unwrap();
        assert!(matches!(text.content, AiMessageContent::Text(ref s) if s == "hi"));

        let parts: AiMessage = serde_json::from_str(
            r#"{"role":"user","content":[{"type":"text","text":"hi"},{"type":"image","media_type":"image/png","data":"abc"}]}"#,
        )
        .unwrap();
        match parts.content {
            AiMessageContent::Parts(ref p) => assert_eq!(p.len(), 2),
            _ => panic!("expected parts"),
        }
    }

    #[test]
    fn chat_request_body_encodes_image_parts_as_image_url() {
        let messages = vec![AiMessage {
            role: "user".to_string(),
            content: AiMessageContent::Parts(vec![
                AiContentPart::Text {
                    text: "look".to_string(),
                },
                AiContentPart::Image {
                    media_type: "image/png".to_string(),
                    data: "abc".to_string(),
                },
            ]),
        }];
        let body = build_chat_request_body("", &messages, "m", true);
        let content = &body["messages"][0]["content"];
        assert_eq!(content[0]["type"], "text");
        assert_eq!(content[1]["type"], "image_url");
        assert_eq!(
            content[1]["image_url"]["url"],
            "data:image/png;base64,abc"
        );
    }

    #[test]
    fn chat_request_body_keeps_plain_string_content() {
        let messages = vec![AiMessage {
            role: "user".to_string(),
            content: AiMessageContent::Text("hi".to_string()),
        }];
        let body = build_chat_request_body("sys", &messages, "m", true);
        assert_eq!(body["messages"][0]["content"], "sys");
        assert_eq!(body["messages"][1]["content"], "hi");
    }

    #[test]
    fn cli_prompt_strips_images() {
        let messages = vec![AiMessage {
            role: "user".to_string(),
            content: AiMessageContent::Parts(vec![
                AiContentPart::Text {
                    text: "describe".to_string(),
                },
                AiContentPart::Image {
                    media_type: "image/png".to_string(),
                    data: "abc".to_string(),
                },
            ]),
        }];
        let prompt = build_prompt_text("", &messages);
        assert!(prompt.contains("describe"));
        assert!(prompt.contains("[image omitted]"));
        assert!(!prompt.contains("abc"));
    }

    #[test]
    fn cli_prompt_never_injects_role_tags() {
        let messages = vec![AiMessage {
            role: "user".to_string(),
            content: AiMessageContent::Text("the question".to_string()),
        }];
        let prompt = build_prompt_text("You are an assistant.", &messages);
        assert!(prompt.contains("You are an assistant."));
        assert!(prompt.contains("the question"));
        for tag in ["<system>", "</system>", "<user>", "</user>"] {
            assert!(!prompt.contains(tag), "prompt must not inject {tag}");
        }
    }
}
