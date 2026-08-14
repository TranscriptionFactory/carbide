use crate::features::mcp::auth;
use crate::features::mcp::http::HttpServerState;
use crate::features::mcp::router::McpRouter;
use crate::features::mcp::setup;
use crate::features::pipeline::service as pipeline;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{oneshot, Mutex};

use super::harness::McpEndpoint;
use super::permissions::SessionPolicy;
use super::service::{AiProviderConfig, AiTransport};
use super::stream::AiMessage;

/// Surface capability scope, not a permission mode: it says which tools a
/// surface advertises at all, never whether the user consented to one. Chat
/// sends `Full` and gates on `SessionPolicy`; inline edit sends `Only`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ToolSelector {
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
    /// The session's live consent as the frontend holds it. Applied to the
    /// session's shared cell on every turn, so the store stays authoritative
    /// even if a flip was missed while no run was in flight.
    #[serde(default)]
    pub auto_approve: bool,
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
    let lower = super::harness::strip_mcp_prefix(name).to_ascii_lowercase();
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
    // The first `tool_call` frame comes from `content_block_start`, where the
    // streaming API carries `input: {}` — so its `input_summary` and its
    // input-derived `name` are both placeholders. The corrected values arrive
    // here and must be carried forward, or the card renders that first snapshot
    // for the call's whole life. Absent on updates that refine neither.
    #[serde(rename = "tool_update")]
    ToolUpdate {
        id: String,
        status: ToolCallStatus,
        content: Vec<ToolContent>,
        paths: Vec<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        input_summary: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        name: Option<String>,
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
    /// One live policy per assistant session, keyed by the session id the
    /// frontend learns from `Init` — which is what a flip arrives addressed
    /// to. Held here rather than cloned into each run: the cell is the whole
    /// point, and a per-run copy could not be flipped.
    policies: Mutex<HashMap<String, Arc<SessionPolicy>>>,
}

impl AgentRunState {
    pub(crate) async fn remove_handle(&self, request_id: &str) {
        self.handles.lock().await.remove(request_id);
    }

    /// Reuses the session's existing cell across turns, restating the
    /// frontend's value each time so the store stays authoritative.
    pub(crate) async fn policy_for(
        &self,
        session_key: &str,
        auto_approve: bool,
    ) -> Arc<SessionPolicy> {
        let policy = self
            .policies
            .lock()
            .await
            .entry(session_key.to_string())
            .or_default()
            .clone();
        policy.set_auto_approve(auto_approve);
        policy
    }

    pub(crate) async fn remove_policy(&self, session_key: &str) {
        self.policies.lock().await.remove(session_key);
    }

    pub(crate) async fn policy(&self, session_key: &str) -> Option<Arc<SessionPolicy>> {
        self.policies.lock().await.get(session_key).cloned()
    }
}

// The minted token carries the surface's tool scope and the session's live
// policy: an agent that ignores its client-side restrictions still cannot
// reach a tool outside the selector, nor mutate without consent.
pub(crate) async fn prepare_mcp_endpoint(
    app: &AppHandle,
    toolset: &ToolSelector,
    policy: Arc<SessionPolicy>,
) -> Result<McpEndpoint, String> {
    let server = app.state::<HttpServerState>();
    let info = server.start(app.clone()).await?;
    let token = server.mint_scoped_token(toolset.clone(), policy);
    Ok(McpEndpoint {
        port: info.port,
        token,
    })
}

// Terminal handoff runs under the user's own hands; it keeps the legacy
// global token, which resolves to Full.
pub(crate) async fn prepare_mcp_config(app: &AppHandle) -> Result<String, String> {
    let server = app.state::<HttpServerState>();
    let info = server.start(app.clone()).await?;
    let token = auth::read_or_create_token()?;
    let config_path = setup::write_agent_mcp_config(info.port, &token)?;
    Ok(config_path.to_string_lossy().to_string())
}

/// Character-bounded summary for anything shown in a tool card: cuts on a char
/// boundary and marks the cut so a capped summary is never mistaken for the
/// whole value.
pub fn summarize_chars(text: &str, limit: usize) -> String {
    match text.char_indices().nth(limit) {
        Some((cut, _)) => format!("{}…", &text[..cut]),
        None => text.to_string(),
    }
}

/// Serializes only as far as the cap: raw tool input can carry a whole file,
/// and rendering it in full just to slice 200 chars off the front is the
/// expensive part.
pub fn summarize_json(value: &serde_json::Value, limit: usize) -> String {
    let mut writer = CappedWriter {
        buf: Vec::with_capacity(limit.min(1024)),
        limit,
    };
    let truncated = serde_json::to_writer(&mut writer, value).is_err();
    let text = String::from_utf8_lossy(&writer.buf).into_owned();
    if truncated {
        format!("{text}…")
    } else {
        text
    }
}

struct CappedWriter {
    buf: Vec<u8>,
    limit: usize,
}

impl std::io::Write for CappedWriter {
    fn write(&mut self, data: &[u8]) -> std::io::Result<usize> {
        let room = self.limit.saturating_sub(self.buf.len());
        if room == 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::WriteZero,
                "summary limit reached",
            ));
        }
        let take = room.min(data.len());
        self.buf.extend_from_slice(&data[..take]);
        Ok(take)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
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
            let Some(acp_spec) = spec.acp_agent.clone() else {
                let _ = app.emit(
                    &event_name,
                    AgentEvent::Error {
                        message: format!(
                            "{} has no ACP agent configured — pick one in AI settings",
                            spec.provider_config.name
                        ),
                    },
                );
                return Ok(());
            };

            // The provider session id round-trips through the frontend: the
            // Init the frontend stores is this key, so a later turn's
            // resume_session_id finds the same live process.
            let session_key = spec
                .resume_session_id
                .clone()
                .unwrap_or_else(|| request_id.clone());
            // Consent is deliberately NOT part of session identity — it lives
            // in the session's shared cell, which is what makes it flippable
            // mid-conversation. Only the surface's tool scope, which the
            // scoped token is minted against, can retire the process.
            let fingerprint = format!(
                "{}|{}",
                serde_json::to_string(&acp_spec).unwrap_or_default(),
                serde_json::to_string(&spec.toolset).unwrap_or_default(),
            );

            let policy = state.policy_for(&session_key, spec.auto_approve).await;
            let manager = app.state::<super::acp::AcpSessionManager>();
            let handle = match manager.get_matching(&session_key, &fingerprint, &spec.vault_path)
            {
                // Follow-up turn on a live session: no launch resolution, no
                // token mint, no catalog rebuild — straight to the prompt.
                Some(handle) => handle,
                None => {
                    let path_env = pipeline::get_expanded_path();
                    let launch = {
                        let acp_spec = acp_spec.clone();
                        let path_env = path_env.clone();
                        match tauri::async_runtime::spawn_blocking(move || {
                            super::acp::resolve_acp_launch(&acp_spec, &path_env)
                        })
                        .await
                        .map_err(|e| e.to_string())?
                        {
                            Ok(launch) => launch,
                            Err(e) => {
                                let _ = app.emit(&event_name, AgentEvent::Error { message: e });
                                return Ok(());
                            }
                        }
                    };

                    let endpoint = match prepare_mcp_endpoint(
                        &app,
                        &spec.toolset,
                        policy.clone(),
                    )
                    .await
                    {
                        Ok(endpoint) => endpoint,
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

                    let catalog = McpRouter::with_app(app.clone()).tool_definitions_public();
                    let mutating = super::harness::MutatingToolSet::from_catalog(&catalog);

                    let config = super::acp::AcpSessionConfig {
                        launch,
                        cwd: spec.vault_path.clone(),
                        path_env,
                        mcp_port: endpoint.port,
                        mcp_token: endpoint.token.clone(),
                        policy: policy.clone(),
                        mutating,
                        agent_id: acp_spec.agent_id(),
                        permissions: app
                            .state::<std::sync::Arc<super::permissions::PermissionEngine>>()
                            .inner()
                            .clone(),
                    };

                    // Token and policy lifetimes are owned by session
                    // lifetime: whatever retires the process revokes its
                    // credential and drops the cell a flip would address.
                    let revoke_app = app.clone();
                    let token = endpoint.token;
                    let retired_key = session_key.clone();
                    let on_retire = Box::new(move || {
                        revoke_app
                            .state::<HttpServerState>()
                            .revoke_scoped_token(&token);
                        let revoke_app = revoke_app.clone();
                        tauri::async_runtime::spawn(async move {
                            revoke_app
                                .state::<AgentRunState>()
                                .remove_policy(&retired_key)
                                .await;
                        });
                    });

                    match manager.get_or_spawn(&session_key, &fingerprint, config, on_retire) {
                        Ok(handle) => handle,
                        Err(e) => {
                            let _ = app.emit(&event_name, AgentEvent::Error { message: e });
                            return Ok(());
                        }
                    }
                }
            };

            let (abort_tx, abort_rx) = oneshot::channel::<()>();
            state
                .handles
                .lock()
                .await
                .insert(request_id.clone(), abort_tx);
            {
                let handle = handle.clone();
                tokio::spawn(async move {
                    if abort_rx.await.is_ok() {
                        let _ = handle.cancel();
                    }
                });
            }

            let emit_app = app.clone();
            let evt_name = event_name.clone();
            let key = session_key.clone();
            let req_id = request_id.clone();
            let sink: super::acp::EventSink = std::sync::Arc::new(move |event| {
                let event = match event {
                    // The actor announces its own ACP session id; the frontend
                    // must get the manager key back or resume misses the cache.
                    AgentEvent::Init { .. } => AgentEvent::Init {
                        session_id: key.clone(),
                    },
                    other => other,
                };
                let terminal = matches!(
                    event,
                    AgentEvent::Done { .. } | AgentEvent::Error { .. }
                );
                let _ = emit_app.emit(&evt_name, event);
                if terminal {
                    let emit_app = emit_app.clone();
                    let req_id = req_id.clone();
                    tauri::async_runtime::spawn(async move {
                        emit_app
                            .state::<AgentRunState>()
                            .remove_handle(&req_id)
                            .await;
                    });
                }
            });

            if let Err(e) = handle.prompt(spec.prompt.clone(), sink) {
                manager.remove(&session_key);
                state.handles.lock().await.remove(&request_id);
                let _ = app.emit(&event_name, AgentEvent::Error { message: e });
            }
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

            // A native turn is its own session: it announces `request_id` as
            // the session id, so that is the key a flip arrives addressed to.
            let policy = state.policy_for(&request_id, spec.auto_approve).await;

            super::native_agent::spawn_native_turn(
                app,
                event_name,
                request_id,
                spec,
                policy,
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

/// Flips one session's consent while it is live. Addressed by the session id
/// the frontend holds, so a session with nothing in flight is simply unknown
/// here — the store is authoritative and the next run carries the value in.
///
/// Switching on decides whatever this session left parked: the flip IS the
/// answer to a prompt the user is looking at, and leaving it standing would
/// make the toggle a promise the run does not keep.
#[tauri::command]
#[specta::specta]
pub async fn agent_run_set_auto_approve(
    state: tauri::State<'_, AgentRunState>,
    engine: tauri::State<'_, Arc<super::permissions::PermissionEngine>>,
    session_id: String,
    enabled: bool,
) -> Result<bool, String> {
    let Some(policy) = state.policy(&session_id).await else {
        return Ok(false);
    };
    policy.set_auto_approve(enabled);
    if !enabled {
        return Ok(true);
    }

    for request_id in policy.take_parked() {
        if let Some(spec) = engine.resolve_auto(&request_id) {
            grant_mcp_ticket(&policy, &spec);
        }
    }
    Ok(true)
}

/// A Carbide MCP tool is asked for over ACP and called over HTTP. When the
/// engine says yes to the first, this is what lets the second through without
/// asking again.
pub(crate) fn grant_mcp_ticket(
    policy: &SessionPolicy,
    spec: &super::permissions::PermissionRequestSpec,
) {
    if !spec.mutating {
        return;
    }
    if let Some(name) = spec.name.strip_prefix(super::harness::MCP_TOOL_PREFIX) {
        policy.grant_ticket(name);
    }
}
