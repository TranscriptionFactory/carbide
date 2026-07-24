use crate::features::mcp::auth;
use crate::features::mcp::http::HttpServerState;
use crate::features::mcp::setup;
use crate::features::pipeline::service as pipeline;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{oneshot, Mutex};

use super::harness::claude_adapter::ClaudeAdapter;
use super::harness::{HarnessAdapter, HarnessEventParser};
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

            let adapter = ClaudeAdapter;
            let args = adapter.spawn_args(
                &spec.prompt,
                &mcp_config_path,
                &spec.permission_mode,
                spec.resume_session_id.as_deref(),
            );
            let parser = adapter.new_parser();

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
                    parser,
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
    mut parser: Box<dyn HarnessEventParser>,
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

    tokio::select! {
        _ = async {
            while let Ok(Some(line)) = reader.next_line().await {
                for event in parser.parse_line(&line) {
                    let _ = app.emit(event_name, event);
                }
            }

            match child.wait().await {
                Ok(s) if s.success() => {
                    if !parser.saw_result() {
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
