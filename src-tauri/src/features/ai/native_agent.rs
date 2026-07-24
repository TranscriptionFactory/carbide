use std::collections::HashSet;
use std::time::Instant;

use futures_util::{Stream, StreamExt};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;

use crate::features::mcp::router::McpRouter;
use crate::features::mcp::types::{ContentBlock, ToolDefinition, ToolResult};

use super::agent_stream::{AgentEvent, AgentRunSpec, AgentRunState, AgentRunStats, ToolSelector};
use super::service::{AiProviderConfig, AiTransport};
use super::stream::{AiContentPart, AiMessage, AiMessageContent, AiStreamEvent, AiToolCall};

pub const MAX_ITERATIONS: u32 = 16;
pub const TOOL_RESULT_MAX_CHARS: usize = 4000;
pub const HISTORY_MAX_MESSAGES: usize = 40;
pub const HISTORY_MAX_CHARS: usize = 100_000;
const INPUT_SUMMARY_MAX_CHARS: usize = 200;

pub trait ModelClient: Send + Sync {
    fn stream_turn(
        &self,
        messages: Vec<AiMessage>,
        tools: Vec<ToolDefinition>,
    ) -> impl Stream<Item = AiStreamEvent> + Send;
}

pub fn allowed_tools(catalog: &[ToolDefinition], selector: &ToolSelector) -> Vec<ToolDefinition> {
    match selector {
        ToolSelector::Full => catalog.to_vec(),
        ToolSelector::ReadOnly => catalog.iter().filter(|t| !t.mutating).cloned().collect(),
        ToolSelector::Only { names } => catalog
            .iter()
            .filter(|t| names.contains(&t.name))
            .cloned()
            .collect(),
    }
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

pub fn build_system_prompt(vault_path: &str) -> String {
    format!(
        "You are Carbide's vault-scoped assistant operating on the vault at {vault_path}. \
Use the provided tools to read, search, and edit notes before answering. \
Only act within this vault; do not assume access to anything outside the tool catalog."
    )
}

fn summarize_arguments(arguments: &str) -> String {
    let chars: Vec<char> = arguments.chars().collect();
    if chars.len() <= INPUT_SUMMARY_MAX_CHARS {
        arguments.to_string()
    } else {
        let head: String = chars[..INPUT_SUMMARY_MAX_CHARS].iter().collect();
        format!("{head}…")
    }
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

pub async fn run_native_turn<C, D, E>(
    client: C,
    mut dispatch: D,
    session_id: String,
    system_prompt: String,
    mut history: Vec<AiMessage>,
    catalog: Vec<ToolDefinition>,
    toolset: ToolSelector,
    mut abort_rx: oneshot::Receiver<()>,
    mut emit: E,
) where
    C: ModelClient,
    D: FnMut(&str, Option<&Value>) -> ToolResult,
    E: FnMut(AgentEvent),
{
    emit(AgentEvent::Init { session_id });
    let start = Instant::now();

    let allowed = allowed_tools(&catalog, &toolset);
    let allowed_names: HashSet<String> = allowed.iter().map(|t| t.name.clone()).collect();

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

            emit(AgentEvent::ToolStart {
                name: name.clone(),
                input_summary: summarize_arguments(&arguments),
            });

            if !allowed_names.contains(&name) {
                emit(AgentEvent::ToolEnd {
                    name: name.clone(),
                    ok: false,
                    result_summary: None,
                });
                let denial = format!(
                    "Tool '{name}' is not available in the current permission mode and was not executed."
                );
                history.push(tool_result_message(&id, denial));
                continue;
            }

            let args_value = parse_arguments(&arguments);
            let result = dispatch(&name, args_value.as_ref());
            let ok = !result.is_error;
            let text = truncate_tool_result(&tool_result_text(&result));
            emit(AgentEvent::ToolEnd {
                name: name.clone(),
                ok,
                result_summary: None,
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
    let system_prompt = build_system_prompt(&spec.vault_path);
    let session_id = request_id.clone();
    let client = TransportModelClient::new(spec.provider_config);
    let toolset = spec.toolset;

    let emit_app = app.clone();
    let emit = move |event: AgentEvent| {
        let _ = emit_app.emit(&event_name, event);
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
        )
        .await;
        app_clone
            .state::<AgentRunState>()
            .remove_handle(&req_id)
            .await;
    });
}
