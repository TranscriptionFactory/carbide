use crate::features::mcp::auth;
use crate::features::mcp::http::HttpServerState;
use crate::features::mcp::setup;
use crate::features::pipeline::service as pipeline;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{oneshot, Mutex};

use super::service::{AiProviderConfig, AiTransport};
use super::stream::{collect_stderr_tail, AiMessage};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum AgentPermissionMode {
    Safe,
    Power,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum AgentRunBackend {
    Harness,
    Native,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AgentRunSpec {
    pub provider_config: AiProviderConfig,
    pub prompt: String,
    pub vault_path: String,
    pub permission_mode: AgentPermissionMode,
    pub resume_session_id: Option<String>,
    pub backend: AgentRunBackend,
    #[serde(default)]
    pub history: Vec<AiMessage>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct AgentRunStats {
    pub duration_ms: u32,
    pub num_turns: u32,
    pub total_cost_usd: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum AgentEvent {
    #[serde(rename = "init")]
    Init { session_id: String },
    #[serde(rename = "text")]
    Text { delta: String },
    #[serde(rename = "reasoning")]
    Reasoning { delta: String },
    #[serde(rename = "tool_start")]
    ToolStart { name: String, input_summary: String },
    #[serde(rename = "tool_end")]
    ToolEnd {
        name: String,
        ok: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        result_summary: Option<String>,
    },
    #[serde(rename = "done")]
    Done { stats: AgentRunStats },
    #[serde(rename = "error")]
    Error { message: String },
}

#[derive(Default)]
pub struct AgentRunState {
    handles: Mutex<HashMap<String, oneshot::Sender<()>>>,
}

impl AgentRunState {
    pub(crate) async fn remove_handle(&self, request_id: &str) {
        self.handles.lock().await.remove(request_id);
    }
}

const INPUT_SUMMARY_MAX_CHARS: usize = 200;

#[derive(Default)]
pub struct AgentEventParser {
    tool_names: HashMap<String, String>,
    saw_result: bool,
}

impl AgentEventParser {
    pub fn parse_line(&mut self, line: &str) -> Vec<AgentEvent> {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            return Vec::new();
        };
        match value.get("type").and_then(Value::as_str) {
            Some("system") => self.parse_system(&value),
            Some("stream_event") => self.parse_stream_event(&value),
            Some("assistant") => self.parse_assistant(&value),
            Some("user") => self.parse_user(&value),
            Some("result") => self.parse_result(&value),
            _ => Vec::new(),
        }
    }

    fn parse_system(&mut self, value: &Value) -> Vec<AgentEvent> {
        if value.get("subtype").and_then(Value::as_str) != Some("init") {
            return Vec::new();
        }
        let Some(session_id) = value.get("session_id").and_then(Value::as_str) else {
            return Vec::new();
        };
        vec![AgentEvent::Init {
            session_id: session_id.to_string(),
        }]
    }

    fn parse_stream_event(&mut self, value: &Value) -> Vec<AgentEvent> {
        let Some(delta) = value.get("event").and_then(|e| e.get("delta")) else {
            return Vec::new();
        };
        if delta.get("type").and_then(Value::as_str) != Some("text_delta") {
            return Vec::new();
        }
        let Some(text) = delta.get("text").and_then(Value::as_str) else {
            return Vec::new();
        };
        vec![AgentEvent::Text {
            delta: text.to_string(),
        }]
    }

    fn parse_assistant(&mut self, value: &Value) -> Vec<AgentEvent> {
        let Some(blocks) = message_content(value) else {
            return Vec::new();
        };
        blocks
            .iter()
            .filter(|b| b.get("type").and_then(Value::as_str) == Some("tool_use"))
            .filter_map(|b| {
                let name = b.get("name").and_then(Value::as_str)?.to_string();
                if let Some(id) = b.get("id").and_then(Value::as_str) {
                    self.tool_names.insert(id.to_string(), name.clone());
                }
                let input_summary = b
                    .get("input")
                    .map(|input| summarize_input(input))
                    .unwrap_or_default();
                Some(AgentEvent::ToolStart {
                    name,
                    input_summary,
                })
            })
            .collect()
    }

    fn parse_user(&mut self, value: &Value) -> Vec<AgentEvent> {
        let Some(blocks) = message_content(value) else {
            return Vec::new();
        };
        blocks
            .iter()
            .filter(|b| b.get("type").and_then(Value::as_str) == Some("tool_result"))
            .map(|b| {
                let name = b
                    .get("tool_use_id")
                    .and_then(Value::as_str)
                    .and_then(|id| self.tool_names.get(id).cloned())
                    .unwrap_or_else(|| "tool".to_string());
                let ok = !b.get("is_error").and_then(Value::as_bool).unwrap_or(false);
                AgentEvent::ToolEnd {
                    name,
                    ok,
                    result_summary: None,
                }
            })
            .collect()
    }

    fn parse_result(&mut self, value: &Value) -> Vec<AgentEvent> {
        self.saw_result = true;
        let is_error = value.get("is_error").and_then(Value::as_bool).unwrap_or(false);
        let subtype = value.get("subtype").and_then(Value::as_str);
        if is_error || subtype != Some("success") {
            let message = value
                .get("result")
                .and_then(Value::as_str)
                .or(subtype)
                .unwrap_or("agent run failed")
                .to_string();
            return vec![AgentEvent::Error { message }];
        }
        vec![AgentEvent::Done {
            stats: AgentRunStats {
                duration_ms: value.get("duration_ms").and_then(Value::as_u64).unwrap_or(0) as u32,
                num_turns: value.get("num_turns").and_then(Value::as_u64).unwrap_or(0) as u32,
                total_cost_usd: value
                    .get("total_cost_usd")
                    .and_then(Value::as_f64)
                    .unwrap_or(0.0),
            },
        }]
    }
}

fn message_content(value: &Value) -> Option<&Vec<Value>> {
    value.get("message")?.get("content")?.as_array()
}

fn summarize_input(input: &Value) -> String {
    let raw = input.to_string();
    let chars: Vec<char> = raw.chars().collect();
    if chars.len() <= INPUT_SUMMARY_MAX_CHARS {
        raw
    } else {
        let head: String = chars[..INPUT_SUMMARY_MAX_CHARS].iter().collect();
        format!("{head}…")
    }
}

pub fn build_agent_args(
    prompt: &str,
    mcp_config_path: &str,
    permission_mode: &AgentPermissionMode,
    resume_session_id: Option<&str>,
) -> Vec<String> {
    let mut args: Vec<String> = [
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--strict-mcp-config",
        "--mcp-config",
        mcp_config_path,
    ]
    .map(String::from)
    .to_vec();
    match permission_mode {
        AgentPermissionMode::Safe => {
            args.extend(
                [
                    "--allowedTools",
                    "mcp__carbide__*",
                    "--disallowedTools",
                    "Bash",
                    "Write",
                    "Edit",
                ]
                .map(String::from),
            );
        }
        AgentPermissionMode::Power => {
            args.extend(["--permission-mode", "acceptEdits"].map(String::from));
        }
    }
    if let Some(id) = resume_session_id {
        args.extend(["--resume", id].map(String::from));
    }
    args
}

pub(crate) async fn prepare_mcp_config(app: &AppHandle) -> Result<String, String> {
    let server = app.state::<HttpServerState>();
    let info = server.start(app.clone()).await?;
    let token = auth::read_or_create_token()?;
    let config_path = setup::write_agent_mcp_config(info.port, &token)?;
    Ok(config_path.to_string_lossy().to_string())
}

pub fn cli_probe_error_message(provider_name: &str, probe: &pipeline::CliProbe) -> String {
    match (&probe.status, &probe.error) {
        (_, Some(detail)) if detail.contains("not executable") => {
            format!("{provider_name}: {detail}")
        }
        (pipeline::CliProbeStatus::Unknown, _) => format!(
            "Could not verify the {provider_name} CLI — set an absolute command path in AI settings"
        ),
        _ => format!(
            "{provider_name} CLI not found — install it or set an absolute command path in AI settings"
        ),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn agent_run_start(
    app: AppHandle,
    state: tauri::State<'_, AgentRunState>,
    request_id: String,
    spec: AgentRunSpec,
) -> Result<(), String> {
    let event_name = format!("agent-run-event:{request_id}");

    match &spec.backend {
        AgentRunBackend::Harness => {
            let AiTransport::Cli { command, .. } = &spec.provider_config.transport else {
                let _ = app.emit(
                    &event_name,
                    AgentEvent::Error {
                        message: format!(
                            "{} does not support agent mode",
                            spec.provider_config.name
                        ),
                    },
                );
                return Ok(());
            };

            let path = pipeline::get_expanded_path();
            let probe = tauri::async_runtime::spawn_blocking({
                let command = command.clone();
                let path = path.clone();
                move || pipeline::resolve_cli_with_path(&command, &path)
            })
            .await
            .map_err(|e| e.to_string())?;
            if probe.status != pipeline::CliProbeStatus::Present {
                let message =
                    cli_probe_error_message(&spec.provider_config.name, &probe);
                let _ = app.emit(&event_name, AgentEvent::Error { message });
                return Ok(());
            }

            let mcp_config_path = match prepare_mcp_config(&app).await {
                Ok(path) => path,
                Err(e) => {
                    let _ = app.emit(
                        &event_name,
                        AgentEvent::Error {
                            message: format!("Carbide MCP server unavailable: {e}"),
                        },
                    );
                    return Ok(());
                }
            };

            let args = build_agent_args(
                &spec.prompt,
                &mcp_config_path,
                &spec.permission_mode,
                spec.resume_session_id.as_deref(),
            );

            let (abort_tx, abort_rx) = oneshot::channel::<()>();
            state
                .handles
                .lock()
                .await
                .insert(request_id.clone(), abort_tx);

            let resolved_path = probe
                .resolved_path
                .as_deref()
                .and_then(|p| std::path::Path::new(p).parent())
                .map(|parent| pipeline::path_with_dir_prepended(parent, &path))
                .unwrap_or(path);
            let command = probe.resolved_path.unwrap_or_else(|| command.clone());
            let vault_path = spec.vault_path.clone();
            let req_id = request_id.clone();
            let evt_name = event_name.clone();

            tokio::spawn(async move {
                let result = run_agent_cli(
                    &app,
                    &evt_name,
                    &command,
                    &args,
                    &resolved_path,
                    &vault_path,
                    abort_rx,
                )
                .await;

                app.state::<AgentRunState>()
                    .remove_handle(&req_id)
                    .await;

                if let Err(e) = result {
                    let _ = app.emit(&evt_name, AgentEvent::Error { message: e });
                }
            });
        }
        AgentRunBackend::Native => {
            let AiTransport::Api { .. } = &spec.provider_config.transport else {
                let _ = app.emit(
                    &event_name,
                    AgentEvent::Error {
                        message: format!(
                            "{} does not support native agent mode",
                            spec.provider_config.name
                        ),
                    },
                );
                return Ok(());
            };

            let (abort_tx, abort_rx) = oneshot::channel::<()>();
            state
                .handles
                .lock()
                .await
                .insert(request_id.clone(), abort_tx);

            super::native_agent::spawn_native_turn(
                app,
                event_name,
                request_id,
                spec,
                abort_rx,
            );
        }
    }

    Ok(())
}

async fn run_agent_cli(
    app: &AppHandle,
    event_name: &str,
    command: &str,
    args: &[String],
    path: &str,
    vault_path: &str,
    abort_rx: oneshot::Receiver<()>,
) -> Result<(), String> {
    let mut cmd = Command::new(command);
    cmd.args(args)
        .env("PATH", path)
        .current_dir(vault_path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn {command}: {e}"))?;

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
    let mut parser = AgentEventParser::default();

    tokio::select! {
        _ = async {
            while let Ok(Some(line)) = reader.next_line().await {
                for event in parser.parse_line(&line) {
                    let _ = app.emit(event_name, event);
                }
            }

            match child.wait().await {
                Ok(s) if s.success() => {
                    if !parser.saw_result {
                        let _ = app.emit(event_name, AgentEvent::Error {
                            message: "agent exited without a result".to_string(),
                        });
                    }
                }
                Ok(s) => {
                    let code = s.code().unwrap_or(-1);
                    let detail = collect_stderr_tail(stderr_handle).await;
                    let message = if detail.is_empty() {
                        format!("Process exited with code {code}")
                    } else {
                        format!("Process exited with code {code}: {detail}")
                    };
                    let _ = app.emit(event_name, AgentEvent::Error { message });
                }
                Err(e) => {
                    let _ = app.emit(event_name, AgentEvent::Error {
                        message: format!("Process error: {e}"),
                    });
                }
            }
        } => {}
        _ = abort_rx => {
            let _ = child.kill().await;
            let _ = app.emit(event_name, AgentEvent::Error {
                message: "aborted".to_string(),
            });
        }
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn agent_run_abort(
    state: tauri::State<'_, AgentRunState>,
    request_id: String,
) -> Result<(), String> {
    if let Some(abort_tx) = state.handles.lock().await.remove(&request_id) {
        let _ = abort_tx.send(());
    }
    Ok(())
}
