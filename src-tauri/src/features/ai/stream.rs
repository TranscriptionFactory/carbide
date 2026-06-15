use crate::features::pipeline::service as pipeline;
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
        AiTransport::Api { .. } => {
            Err("API-based streaming is not yet supported".to_string())
        }
    }
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
    use super::clamp_stderr;

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
