use crate::features::mcp::auth;
use crate::features::mcp::http::HttpServerState;
use crate::features::mcp::router::McpRouter;
use crate::features::mcp::setup;
use crate::features::mcp::types::ToolDefinition;
use crate::features::pipeline::service as pipeline;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{oneshot, Mutex};

use super::harness::McpEndpoint;
use super::service::{AiProviderConfig, AiTransport};
use super::stream::AiMessage;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ToolSelector {
    ReadOnly,
    Full,
    Only { names: Vec<String> },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum AgentRunBackend {
    Acp,
    Native,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AgentRunSpec {
    pub provider_config: AiProviderConfig,
    pub prompt: String,
    pub vault_path: String,
    pub toolset: ToolSelector,
    pub resume_session_id: Option<String>,
    pub backend: AgentRunBackend,
    #[serde(default)]
    pub acp_agent: Option<super::acp::AcpAgentSpec>,
    #[serde(default)]
    pub history: Vec<AiMessage>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct AgentRunStats {
    pub duration_ms: u32,
    pub num_turns: u32,
    pub total_cost_usd: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ToolKind {
    Read,
    Edit,
    Delete,
    Move,
    Search,
    Execute,
    Think,
    Fetch,
    SwitchMode,
    Other,
}

/// Best-effort kind for tools that don't declare one (native loop, MCP names).
pub fn infer_tool_kind(name: &str) -> ToolKind {
    let base = name.strip_prefix(super::harness::MCP_TOOL_PREFIX).unwrap_or(name);
    let lower = base.to_ascii_lowercase();
    if lower.contains("delete") || lower.contains("remove") {
        ToolKind::Delete
    } else if lower.contains("move") || lower.contains("rename") {
        ToolKind::Move
    } else if lower.contains("search") || lower.contains("list") || lower.contains("glob") {
        ToolKind::Search
    } else if lower.contains("write") || lower.contains("edit") || lower.contains("update") || lower.contains("create") {
        ToolKind::Edit
    } else if lower.contains("read") || lower.contains("get") || lower.contains("cat") {
        ToolKind::Read
    } else if lower.contains("bash") || lower.contains("exec") || lower.contains("shell") || lower.contains("terminal") {
        ToolKind::Execute
    } else if lower.contains("fetch") || lower.contains("web") {
        ToolKind::Fetch
    } else {
        ToolKind::Other
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ToolLocation {
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ToolContent {
    Diff {
        path: String,
        old_text: Option<String>,
        new_text: String,
    },
    Text {
        text: String,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ToolCallStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum PermissionOptionKind {
    AllowOnce,
    AllowAlways,
    RejectOnce,
    RejectAlways,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct PermissionOptionSpec {
    pub option_id: String,
    pub label: String,
    pub kind: PermissionOptionKind,
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
    ToolStart {
        id: String,
        name: String,
        kind: ToolKind,
        input_summary: String,
        paths: Vec<String>,
        mutating: bool,
        locations: Vec<ToolLocation>,
    },
    #[serde(rename = "tool_update")]
    ToolUpdate {
        id: String,
        status: ToolCallStatus,
        content: Vec<ToolContent>,
        paths: Vec<String>,
    },
    // `paths`/`mutating` re-state the union accumulated across the call's
    // updates: proposal production reads them off the terminal event, so a
    // diff surfaced only mid-call must still be visible here.
    #[serde(rename = "tool_end")]
    ToolEnd {
        id: String,
        name: String,
        ok: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        result_summary: Option<String>,
        paths: Vec<String>,
        mutating: bool,
    },
    #[serde(rename = "permission_request")]
    PermissionRequest {
        request_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        tool_call_id: Option<String>,
        name: String,
        kind: ToolKind,
        input_summary: String,
        paths: Vec<String>,
        mutating: bool,
        options: Vec<PermissionOptionSpec>,
    },
    #[serde(rename = "permission_resolved")]
    PermissionResolved {
        request_id: String,
        outcome: String,
        auto: bool,
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

pub(crate) async fn prepare_mcp_endpoint(app: &AppHandle) -> Result<McpEndpoint, String> {
    let server = app.state::<HttpServerState>();
    let info = server.start(app.clone()).await?;
    let token = auth::read_or_create_token()?;
    Ok(McpEndpoint {
        port: info.port,
        token,
    })
}

pub(crate) async fn prepare_mcp_config(app: &AppHandle) -> Result<String, String> {
    let endpoint = prepare_mcp_endpoint(app).await?;
    let config_path = setup::write_agent_mcp_config(endpoint.port, &endpoint.token)?;
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
        AgentRunBackend::Acp => {
            // Interim stub while the ACP session layer lands; replaced by the
            // AcpSessionManager wiring in this same change series.
            let _ = app.emit(
                &event_name,
                AgentEvent::Error {
                    message: "ACP backend not yet wired".to_string(),
                },
            );
            return Ok(());
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
