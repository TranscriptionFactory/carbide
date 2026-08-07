use std::collections::HashSet;
use std::time::Instant;

use futures_util::{Stream, StreamExt};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;

use crate::features::mcp::auth;
use crate::features::mcp::router::McpRouter;
use crate::features::mcp::types::{ContentBlock, ToolDefinition, ToolResult};

use super::permissions::{
    mint_request_id, option_kind_name, Evaluation, ParkOutcome, PermissionEngine,
    PermissionRequestSpec,
};
use super::agent_stream::{
    infer_tool_kind, summarize_chars, AgentEvent, AgentRunSpec, AgentRunState, AgentRunStats,
    PermissionOptionKind, PermissionOptionSpec, ToolSelector,
};
use super::tool_paths::extract_tool_paths;
use super::service::{AiProviderConfig, AiTransport};
use super::stream::{AiContentPart, AiMessage, AiMessageContent, AiStreamEvent, AiToolCall};

pub const MAX_ITERATIONS: u32 = 16;
pub const TOOL_RESULT_MAX_CHARS: usize = 4000;
pub const HISTORY_MAX_MESSAGES: usize = 40;
pub const HISTORY_MAX_CHARS: usize = 100_000;
pub const SUMMARY_MAX_CHARS: usize = 200;

pub trait ModelClient: Send + Sync {
    fn stream_turn(
        &self,
        messages: Vec<AiMessage>,
        tools: Vec<ToolDefinition>,
    ) -> impl Stream<Item = AiStreamEvent> + Send;
}

pub fn allowed_tools(catalog: &[ToolDefinition], selector: &ToolSelector) -> Vec<ToolDefinition> {
    catalog
        .iter()
        .filter(|t| auth::selector_allows(selector, &t.name, t.mutating))
        .cloned()
        .collect()
}

pub fn truncate_tool_result(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= TOOL_RESULT_MAX_CHARS {
        return text.to_string();
    }
    let head: String = chars[..TOOL_RESULT_MAX_CHARS].iter().collect();
    let dropped = chars.len() - TOOL_RESULT_MAX_CHARS;
    format!("{head}\n…[truncated {dropped} chars]")
}

fn message_char_len(message: &AiMessage) -> usize {
    match &message.content {
        AiMessageContent::Text(text) => text.chars().count(),
        AiMessageContent::Parts(parts) => parts
            .iter()
            .map(|part| match part {
                AiContentPart::Text { text } => text.chars().count(),
                AiContentPart::Image { .. } => 0,
            })
            .sum(),
    }
}

pub fn evict_history(history: Vec<AiMessage>) -> Vec<AiMessage> {
    let mut kept: Vec<AiMessage> = Vec::new();
    let mut chars = 0usize;
    for message in history.into_iter().rev() {
        let len = message_char_len(&message);
        if kept.len() + 1 > HISTORY_MAX_MESSAGES || chars + len > HISTORY_MAX_CHARS {
            break;
        }
        chars += len;
        kept.push(message);
    }
    kept.reverse();

    // An assistant `tool_calls` message and its following `tool` results are one
    // atomic unit: evicting the assistant but keeping a `tool` result leaves an
    // orphaned tool_call_id, which breaks OpenAI-compatible APIs. Drop the
    // orphaned leading `tool` messages the cap left behind.
    let orphan_end = kept
        .iter()
        .position(|message| message.role != "tool")
        .unwrap_or(kept.len());
    kept.drain(..orphan_end);
    kept
}

// Toolset-aware so safe mode never advertises an "edit" capability the
// selector will refuse at dispatch.
pub fn build_system_prompt(vault_path: &str, toolset: &ToolSelector) -> String {
    let actions = match toolset {
        ToolSelector::Full => "read, search, and edit notes",
        ToolSelector::ReadOnly | ToolSelector::Only { .. } => "read and search notes",
    };
    format!(
        "You are Carbide's vault-scoped assistant operating on the vault at {vault_path}. \
Use the provided tools to {actions} before answering. \
Only act within this vault; do not assume access to anything outside the tool catalog."
    )
}

fn parse_arguments(arguments: &str) -> Option<Value> {
    let trimmed = arguments.trim();
    if trimmed.is_empty() {
        return None;
    }
    serde_json::from_str(trimmed).ok()
}

fn tool_result_text(result: &ToolResult) -> String {
    result
        .content
        .iter()
        .map(|block| match block {
            ContentBlock::Text { text } => text.clone(),
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn system_message(prompt: String) -> AiMessage {
    AiMessage {
        role: "system".into(),
        content: AiMessageContent::Text(prompt),
        tool_calls: None,
        tool_call_id: None,
    }
}

fn user_message(prompt: String) -> AiMessage {
    AiMessage {
        role: "user".into(),
        content: AiMessageContent::Text(prompt),
        tool_calls: None,
        tool_call_id: None,
    }
}

fn assistant_tool_call_message(text: &str, calls: &[(String, String, String)]) -> AiMessage {
    AiMessage {
        role: "assistant".into(),
        content: AiMessageContent::Text(text.to_string()),
        tool_calls: Some(
            calls
                .iter()
                .map(|(id, name, arguments)| AiToolCall {
                    id: id.clone(),
                    name: name.clone(),
                    arguments: arguments.clone(),
                })
                .collect(),
        ),
        tool_call_id: None,
    }
}

fn tool_result_message(id: &str, text: String) -> AiMessage {
    AiMessage {
        role: "tool".into(),
        content: AiMessageContent::Text(text),
        tool_calls: None,
        tool_call_id: Some(id.to_string()),
    }
}

/// What the approval hook decided for one dispatch, before any prompt.
pub enum NativeGate {
    Allow,
    Prompt {
        request_id: String,
        wait: futures_util::future::BoxFuture<'static, ParkOutcome>,
    },
}

/// The prompt options the native loop offers — it mints its own, having no
/// agent on the wire to propose any.
pub fn native_permission_options() -> Vec<PermissionOptionSpec> {
    vec![
        PermissionOptionSpec {
            option_id: "allow-once".to_string(),
            label: "Allow".to_string(),
            kind: PermissionOptionKind::AllowOnce,
        },
        PermissionOptionSpec {
            option_id: "allow-always".to_string(),
            label: "Always allow".to_string(),
            kind: PermissionOptionKind::AllowAlways,
        },
        PermissionOptionSpec {
            option_id: "reject-once".to_string(),
            label: "Deny".to_string(),
            kind: PermissionOptionKind::RejectOnce,
        },
    ]
}

pub const NATIVE_AGENT_ID: &str = "native";

#[allow(clippy::too_many_arguments)]
pub async fn run_native_turn<C, D, E, A>(
    client: C,
    mut dispatch: D,
    session_id: String,
    system_prompt: String,
    mut history: Vec<AiMessage>,
    catalog: Vec<ToolDefinition>,
    toolset: ToolSelector,
    mut abort_rx: oneshot::Receiver<()>,
    mut emit: E,
    approval: A,
) where
    C: ModelClient,
    D: FnMut(&str, Option<&Value>) -> ToolResult,
    E: FnMut(AgentEvent),
    A: Fn(&PermissionRequestSpec) -> NativeGate,
{
    emit(AgentEvent::Init { session_id });
    let start = Instant::now();

    // Safe mode offers the full catalog and gates mutating dispatches on
    // approval instead of hiding tools; the Only selector keeps its runtime
    // refusal — it is a surface contract, not a permission mode.
    let allowed = match &toolset {
        ToolSelector::Only { .. } => allowed_tools(&catalog, &toolset),
        ToolSelector::ReadOnly | ToolSelector::Full => catalog.clone(),
    };
    let allowed_names: HashSet<String> = allowed.iter().map(|t| t.name.clone()).collect();
    let mutating_names: HashSet<String> = catalog
        .iter()
        .filter(|t| t.mutating)
        .map(|t| t.name.clone())
        .collect();

    let mut num_turns: u32 = 0;

    loop {
        if abort_rx.try_recv().is_ok() {
            emit(AgentEvent::Error {
                message: "aborted".into(),
            });
            return;
        }
        if num_turns >= MAX_ITERATIONS {
            break;
        }
        num_turns += 1;

        let mut messages = Vec::with_capacity(history.len() + 1);
        messages.push(system_message(system_prompt.clone()));
        messages.extend(history.iter().cloned());

        let mut stream = std::pin::pin!(client.stream_turn(messages, allowed.clone()));
        let mut assistant_text = String::new();
        let mut tool_calls: Vec<(String, String, String)> = Vec::new();
        let mut errored = false;

        while let Some(event) = stream.next().await {
            match event {
                AiStreamEvent::Text { text } => {
                    emit(AgentEvent::Text {
                        delta: text.clone(),
                    });
                    assistant_text.push_str(&text);
                }
                AiStreamEvent::Reasoning { text } => {
                    emit(AgentEvent::Reasoning { delta: text });
                }
                AiStreamEvent::ToolCall {
                    id,
                    name,
                    arguments,
                } => {
                    tool_calls.push((id, name, arguments));
                }
                AiStreamEvent::Error { error } => {
                    emit(AgentEvent::Error { message: error });
                    errored = true;
                    break;
                }
                AiStreamEvent::Done => {}
            }
        }

        if errored {
            return;
        }

        if tool_calls.is_empty() {
            break;
        }

        history.push(assistant_tool_call_message(&assistant_text, &tool_calls));

        for (id, name, arguments) in tool_calls {
            if abort_rx.try_recv().is_ok() {
                emit(AgentEvent::Error {
                    message: "aborted".into(),
                });
                return;
            }

            let args_value = parse_arguments(&arguments);
            let paths = args_value
                .as_ref()
                .map(extract_tool_paths)
                .unwrap_or_default();
            let mutating = mutating_names.contains(&name);
            emit(AgentEvent::ToolStart {
                id: id.clone(),
                name: name.clone(),
                kind: infer_tool_kind(&name),
                input_summary: summarize_chars(&arguments, SUMMARY_MAX_CHARS),
                paths: paths.clone(),
                mutating,
                locations: Vec::new(),
            });

            if !allowed_names.contains(&name) {
                let denial = format!(
                    "Tool '{name}' is not available in the current permission mode and was not executed."
                );
                emit(AgentEvent::ToolEnd {
                    id: id.clone(),
                    name: name.clone(),
                    ok: false,
                    result_summary: Some(summarize_chars(&denial, SUMMARY_MAX_CHARS)),
                    paths,
                    mutating,
                });
                history.push(tool_result_message(&id, denial));
                continue;
            }

            let spec = PermissionRequestSpec {
                agent_id: NATIVE_AGENT_ID.to_string(),
                tool_call_id: Some(id.clone()),
                name: name.clone(),
                kind: infer_tool_kind(&name),
                input_summary: summarize_chars(&arguments, SUMMARY_MAX_CHARS),
                paths: paths.clone(),
                mutating,
                pre_authorized: false,
                options: native_permission_options(),
            };
            let approved = match approval(&spec) {
                NativeGate::Allow => true,
                NativeGate::Prompt { request_id, wait } => {
                    emit(spec.to_event(request_id.clone()));
                    // Stop must land while the user is still deciding: dropping
                    // the wait future is what releases the engine's parked entry.
                    let decision = tokio::select! {
                        decision = wait => decision,
                        Ok(()) = &mut abort_rx => {
                            emit(AgentEvent::Error { message: "aborted".into() });
                            return;
                        }
                    };
                    let (outcome, auto, approved) = match decision {
                        ParkOutcome::Selected { kind, .. } => (
                            format!("selected:{}", option_kind_name(kind)),
                            false,
                            matches!(
                                kind,
                                PermissionOptionKind::AllowOnce
                                    | PermissionOptionKind::AllowAlways
                            ),
                        ),
                        ParkOutcome::Cancelled => ("cancelled".to_string(), true, false),
                        ParkOutcome::Timeout => ("timeout".to_string(), true, false),
                    };
                    emit(AgentEvent::PermissionResolved {
                        request_id,
                        outcome,
                        auto,
                    });
                    approved
                }
            };
            if !approved {
                let denial =
                    format!("Tool '{name}' was denied by the user and was not executed.");
                emit(AgentEvent::ToolEnd {
                    id: id.clone(),
                    name: name.clone(),
                    ok: false,
                    result_summary: Some(summarize_chars(&denial, SUMMARY_MAX_CHARS)),
                    paths,
                    mutating,
                });
                history.push(tool_result_message(&id, denial));
                continue;
            }

            let result = dispatch(&name, args_value.as_ref());
            let ok = !result.is_error;
            let text = truncate_tool_result(&tool_result_text(&result));
            emit(AgentEvent::ToolEnd {
                id: id.clone(),
                name: name.clone(),
                ok,
                result_summary: Some(summarize_chars(&text, SUMMARY_MAX_CHARS)),
                paths,
                mutating,
            });
            history.push(tool_result_message(&id, text));
        }
    }

    emit(AgentEvent::Done {
        stats: AgentRunStats {
            duration_ms: start.elapsed().as_millis() as u32,
            num_turns,
            total_cost_usd: 0.0,
        },
    });
}

pub struct TransportModelClient {
    provider_config: AiProviderConfig,
}

impl TransportModelClient {
    pub fn new(provider_config: AiProviderConfig) -> Self {
        Self { provider_config }
    }
}

async fn request_completion(
    config: AiProviderConfig,
    messages: Vec<AiMessage>,
    tools: Vec<ToolDefinition>,
    tx: tokio::sync::mpsc::UnboundedSender<AiStreamEvent>,
) -> Result<(), String> {
    let AiTransport::Api {
        base_url,
        api_key_env,
    } = &config.transport
    else {
        return Err("Native agent mode requires an API transport".into());
    };

    let url = super::stream::chat_completions_url(base_url);
    let model = config.model.clone().unwrap_or_default();
    let body = super::stream::build_chat_request_body("", &messages, &model, true, Some(&tools));
    let auth_token = super::secrets::resolve_api_key(&config.id, api_key_env.as_deref());

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
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

    super::stream::consume_sse_response(response, &mut |event| {
        let _ = tx.send(event);
    })
    .await
}

impl ModelClient for TransportModelClient {
    fn stream_turn(
        &self,
        messages: Vec<AiMessage>,
        tools: Vec<ToolDefinition>,
    ) -> impl Stream<Item = AiStreamEvent> + Send {
        let config = self.provider_config.clone();
        let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
        tokio::spawn(async move {
            if let Err(error) = request_completion(config, messages, tools, tx.clone()).await {
                let _ = tx.send(AiStreamEvent::Error { error });
            }
        });
        futures_util::stream::unfold(rx, |mut rx| async move {
            rx.recv().await.map(|event| (event, rx))
        })
    }
}

pub fn spawn_native_turn(
    app: AppHandle,
    event_name: String,
    request_id: String,
    spec: AgentRunSpec,
    abort_rx: oneshot::Receiver<()>,
) {
    let router = McpRouter::with_app(app.clone());
    let catalog = router.tool_definitions_public();
    let dispatch = move |name: &str, args: Option<&Value>| router.dispatch_tool_public(name, args);

    let mut history = evict_history(spec.history);
    history.push(user_message(spec.prompt.clone()));
    let system_prompt = build_system_prompt(&spec.vault_path, &spec.toolset);
    let session_id = request_id.clone();
    let client = TransportModelClient::new(spec.provider_config);
    let toolset = spec.toolset;

    let emit_app = app.clone();
    let emit = move |event: AgentEvent| {
        let _ = emit_app.emit(&event_name, event);
    };

    let engine = app
        .state::<std::sync::Arc<PermissionEngine>>()
        .inner()
        .clone();
    let gate_toolset = toolset.clone();
    let approval = move |spec: &PermissionRequestSpec| -> NativeGate {
        match engine.evaluate(&gate_toolset, spec) {
            Evaluation::Allow => NativeGate::Allow,
            Evaluation::Prompt => {
                let request_id = mint_request_id();
                let engine = engine.clone();
                let parked_id = request_id.clone();
                let spec = spec.clone();
                NativeGate::Prompt {
                    request_id,
                    wait: Box::pin(async move { engine.await_decision(parked_id, spec).await }),
                }
            }
        }
    };

    let app_clone = app.clone();
    let req_id = request_id.clone();
    tokio::spawn(async move {
        run_native_turn(
            client,
            dispatch,
            session_id,
            system_prompt,
            history,
            catalog,
            toolset,
            abort_rx,
            emit,
            approval,
        )
        .await;
        app_clone
            .state::<AgentRunState>()
            .remove_handle(&req_id)
            .await;
    });
}
