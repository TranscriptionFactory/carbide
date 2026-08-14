use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use agent_client_protocol::schema::v1::{
    CancelNotification, ClientCapabilities, ContentBlock, FileSystemCapabilities, HttpHeader,
    Implementation, InitializeRequest, McpServer, McpServerHttp, NewSessionRequest, PromptRequest,
    RequestPermissionOutcome, RequestPermissionRequest, RequestPermissionResponse,
    SelectedPermissionOutcome, SessionId, SessionNotification, StopReason, TextContent,
};
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::{
    AcpAgent, AcpAgentConfig, Agent, Client, ConnectionTo, LineDirection,
};
use tokio::sync::mpsc;

use crate::features::ai::agent_stream::{AgentEvent, AgentRunStats, PermissionOptionKind};
use crate::features::ai::harness::MutatingToolSet;
use crate::features::ai::agent_stream::grant_mcp_ticket;
use crate::features::ai::permissions::{
    mint_request_id, option_kind_name, select_allow, Evaluation, ParkOutcome, PermissionEngine,
    PermissionRequestSpec, SessionPolicy,
};
use crate::features::ai::stream::clamp_stderr;

use super::agent_def::AcpLaunch;
use super::policy::build_request_spec;
use super::translate::TurnTranslator;

const STDERR_RING_LINES: usize = 50;

/// Where a turn's events go. Supplied per prompt so one long-lived session can
/// serve successive agent runs, each with its own Tauri event channel.
pub type EventSink = Arc<dyn Fn(AgentEvent) + Send + Sync>;

pub struct AcpSessionConfig {
    pub launch: AcpLaunch,
    pub cwd: String,
    pub path_env: String,
    /// Carbide's MCP endpoint, in scalars so callers never touch the ACP
    /// schema crate; the single `McpServerHttp` is assembled here.
    pub mcp_port: u16,
    pub mcp_token: String,
    /// Shared with the MCP token table and the flip command, never cloned:
    /// this is what makes consent live for the session's whole life. The
    /// surface's tool scope is not carried here — it is spent minting the
    /// token, which is the only thing that enforces it.
    pub policy: Arc<SessionPolicy>,
    pub mutating: MutatingToolSet,
    /// Stable identity grants are keyed by ("claude", "codex", or the custom
    /// command); the permission engine scopes stored grants to it.
    pub agent_id: String,
    pub permissions: std::sync::Arc<PermissionEngine>,
}

pub enum SessionCommand {
    Prompt { text: String, sink: EventSink },
    Cancel,
    Shutdown,
}

#[derive(Clone)]
pub struct SessionHandle {
    pub cmd_tx: mpsc::UnboundedSender<SessionCommand>,
}

impl SessionHandle {
    pub fn prompt(&self, text: String, sink: EventSink) -> Result<(), String> {
        self.send(SessionCommand::Prompt { text, sink })
    }

    pub fn cancel(&self) -> Result<(), String> {
        self.send(SessionCommand::Cancel)
    }

    pub fn shutdown(&self) {
        let _ = self.send(SessionCommand::Shutdown);
    }

    pub fn is_alive(&self) -> bool {
        !self.cmd_tx.is_closed()
    }

    fn send(&self, command: SessionCommand) -> Result<(), String> {
        self.cmd_tx
            .send(command)
            .map_err(|_| "the ACP agent session has stopped".to_string())
    }
}

/// Starts an agent subprocess and the client connection that drives it.
///
/// The SDK's connection is a single future that owns the transport, the
/// dispatch loop and every background task it spawns; its handlers are `Send`
/// but the composed future is not required to be. Rather than constrain it, the
/// session runs on its own thread with a current-thread runtime and is reached
/// only through the `Send` command channel returned here.
pub fn spawn_acp_session(config: AcpSessionConfig) -> Result<SessionHandle, String> {
    let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();

    std::thread::Builder::new()
        .name("acp-session".to_string())
        .spawn(move || {
            let runtime = match tokio::runtime::Builder::new_current_thread().enable_all().build() {
                Ok(runtime) => runtime,
                Err(e) => {
                    log::error!("ACP session runtime failed to start: {e}");
                    return;
                }
            };
            runtime.block_on(run_session(config, cmd_rx));
        })
        .map_err(|e| format!("Failed to start the ACP session thread: {e}"))?;

    Ok(SessionHandle { cmd_tx })
}

async fn run_session(
    config: AcpSessionConfig,
    cmd_rx: mpsc::UnboundedReceiver<SessionCommand>,
) {
    let sink: Arc<Mutex<Option<EventSink>>> = Arc::new(Mutex::new(None));
    let stderr = Arc::new(Mutex::new(VecDeque::<String>::with_capacity(
        STDERR_RING_LINES,
    )));

    let AcpSessionConfig {
        launch,
        cwd,
        path_env,
        mcp_port,
        mcp_token,
        policy,
        mutating,
        agent_id,
        permissions,
    } = config;

    let agent = AcpAgent::new(
        AcpAgentConfig::new(&launch.command)
            .args(launch.args.clone())
            .env("PATH", path_env),
    )
    .with_debug({
        let stderr = stderr.clone();
        move |line, direction| {
            if direction != LineDirection::Stderr {
                return;
            }
            let mut ring = stderr.lock().unwrap();
            if ring.len() == STDERR_RING_LINES {
                ring.pop_front();
            }
            ring.push_back(line.to_string());
        }
    });

    // Shared with the command loop so turn boundaries can clear per-call
    // bookkeeping a cancelled turn would otherwise strand forever.
    let translator = Arc::new(Mutex::new(TurnTranslator::new(mutating)));
    let notification_translator = translator.clone();
    let notification_sink = sink.clone();
    let permission_sink = sink.clone();
    let handler_engine = permissions.clone();
    let handler_agent_id = agent_id.clone();
    // The policy owns this session's parked request ids, so both the things
    // that answer them in bulk — aborting the turn, and switching auto-approve
    // on — reach exactly its own prompts and no other session's.
    let handler_policy = policy.clone();

    let result = Client
        .builder()
        .name("carbide")
        .on_receive_notification(
            async move |notification: SessionNotification, _cx| {
                let events = notification_translator
                    .lock()
                    .unwrap()
                    .on_update(&notification.update);
                for event in events {
                    emit(&notification_sink, event);
                }
                Ok(())
            },
            agent_client_protocol::on_receive_notification!(),
        )
        .on_receive_request(
            async move |request: RequestPermissionRequest, responder, _cx| {
                let spec = build_request_spec(&handler_agent_id, &request);
                let request_id = mint_request_id();

                let answer = match handler_engine.evaluate(&handler_policy, &spec) {
                    Evaluation::Allow => {
                        grant_mcp_ticket(&handler_policy, &spec);
                        auto_answer(&permission_sink, &request_id, &spec)
                    }
                    Evaluation::Prompt => {
                        emit(&permission_sink, spec.to_event(request_id.clone()));
                        handler_policy.park(request_id.clone());
                        let outcome = handler_engine
                            .await_decision(request_id.clone(), spec.clone())
                            .await;
                        handler_policy.unpark(&request_id);
                        // The user said yes to this exact call; the HTTP layer
                        // must not ask again when the harness makes it. A
                        // reject is still a Selected outcome, so the kind is
                        // what decides, not the variant.
                        if matches!(
                            outcome,
                            ParkOutcome::Selected {
                                kind: PermissionOptionKind::AllowOnce
                                    | PermissionOptionKind::AllowAlways,
                                ..
                            }
                        ) {
                            grant_mcp_ticket(&handler_policy, &spec);
                        }
                        settle_prompt(&permission_sink, &request_id, outcome)
                    }
                };

                match answer {
                    Some(option_id) => responder.respond(RequestPermissionResponse::new(
                        RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(
                            option_id,
                        )),
                    )),
                    None => responder.respond(RequestPermissionResponse::new(
                        RequestPermissionOutcome::Cancelled,
                    )),
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .connect_with(agent, async |cx| {
            run_commands(
                cx,
                &cwd,
                mcp_port,
                &mcp_token,
                cmd_rx,
                &sink,
                &translator,
                &policy,
                &permissions,
            )
            .await
        })
        .await;

    if let Err(error) = result {
        emit(
            &sink,
            AgentEvent::Error {
                message: with_stderr_tail(&describe(&error), &stderr),
            },
        );
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_commands(
    cx: ConnectionTo<Agent>,
    cwd: &str,
    mcp_port: u16,
    mcp_token: &str,
    mut cmd_rx: mpsc::UnboundedReceiver<SessionCommand>,
    sink: &Arc<Mutex<Option<EventSink>>>,
    translator: &Arc<Mutex<TurnTranslator>>,
    policy: &Arc<SessionPolicy>,
    permissions: &std::sync::Arc<PermissionEngine>,
) -> Result<(), agent_client_protocol::Error> {
    cx.send_request(
        InitializeRequest::new(ProtocolVersion::V1)
            .client_capabilities(
                ClientCapabilities::new()
                    .fs(FileSystemCapabilities::new()
                        .read_text_file(false)
                        .write_text_file(false))
                    .terminal(false),
            )
            .client_info(Implementation::new("carbide", env!("CARGO_PKG_VERSION"))),
    )
    .block_task()
    .await?;

    let carbide_mcp = McpServer::Http(
        McpServerHttp::new("carbide", format!("http://127.0.0.1:{mcp_port}/mcp")).headers(vec![
            HttpHeader::new("Authorization", format!("Bearer {mcp_token}")),
        ]),
    );
    let session = cx
        .send_request(NewSessionRequest::new(cwd).mcp_servers(vec![carbide_mcp]))
        .block_task()
        .await?;
    // The agent is deliberately left in whatever mode it started in. Its
    // "accept edits" modes suppress the very RequestPermission calls that
    // Carbide's own gate reads, so selecting one would hand consent to the
    // harness — permanently, since a mode chosen at session start cannot
    // follow a mid-conversation flip. Carbide asks, every time, and answers
    // itself when auto-approve is on.
    let session_id = session.session_id;

    let mut announced = false;
    while let Some(command) = cmd_rx.recv().await {
        match command {
            SessionCommand::Prompt { text, sink: turn } => {
                *sink.lock().unwrap() = Some(turn.clone());
                if !announced {
                    turn(AgentEvent::Init {
                        session_id: session_id.to_string(),
                    });
                    announced = true;
                }
                run_turn(&cx, &session_id, text, &turn).await;
                // A cancelled or crashed turn leaves open tool-call state the
                // agent will never settle; the turn boundary is where it dies.
                translator.lock().unwrap().clear_open_calls();
            }
            SessionCommand::Cancel => {
                // A stopped run must not leave a live prompt: unblock this
                // session's parked requests before the agent is told to stop.
                for request_id in policy.take_parked() {
                    permissions.cancel(&request_id);
                }
                cx.send_notification(CancelNotification::new(session_id.clone()))?;
            }
            SessionCommand::Shutdown => break,
        }
    }

    Ok(())
}

async fn run_turn(
    cx: &ConnectionTo<Agent>,
    session_id: &SessionId,
    text: String,
    turn: &EventSink,
) {
    let started = Instant::now();
    let response = cx
        .send_request(PromptRequest::new(
            session_id.clone(),
            vec![ContentBlock::Text(TextContent::new(text))],
        ))
        .block_task()
        .await;

    match response {
        // Cancellation stays an `Error { "aborted" }` rather than a `Done`, so
        // the frontend's abort contract is unchanged from the CLI harness.
        Ok(response) if response.stop_reason == StopReason::Cancelled => turn(AgentEvent::Error {
            message: "aborted".to_string(),
        }),
        Ok(_) => turn(AgentEvent::Done {
            stats: AgentRunStats {
                // ACP v1 reports neither turn counts nor cost on a prompt
                // response; only the wall clock is ours to measure.
                duration_ms: started.elapsed().as_millis().min(u128::from(u32::MAX)) as u32,
                num_turns: 1,
                total_cost_usd: 0.0,
            },
        }),
        Err(error) => turn(AgentEvent::Error {
            message: describe(&error),
        }),
    }
}

fn emit(sink: &Arc<Mutex<Option<EventSink>>>, event: AgentEvent) {
    // Held across the call: the sink never re-enters emit, and dropping the
    // Arc clone saves two atomics per streaming token.
    if let Some(sink) = sink.lock().unwrap().as_ref() {
        sink(event);
    }
}

// Answers an auto allow: picks the mildest grant on offer, records the honest
// resolution in the transcript, returns the option to respond with
// (None ⇒ protocol-level Cancelled).
fn auto_answer(
    sink: &Arc<Mutex<Option<EventSink>>>,
    request_id: &str,
    spec: &PermissionRequestSpec,
) -> Option<String> {
    let selected = select_allow(&spec.options);
    let outcome = match selected {
        Some(option) => format!("selected:{}", option_kind_name(option.kind)),
        None => "cancelled".to_string(),
    };
    emit(
        sink,
        AgentEvent::PermissionResolved {
            request_id: request_id.to_string(),
            outcome,
            auto: true,
        },
    );
    selected.map(|option| option.option_id.clone())
}

fn settle_prompt(
    sink: &Arc<Mutex<Option<EventSink>>>,
    request_id: &str,
    outcome: ParkOutcome,
) -> Option<String> {
    let (outcome_text, auto, option_id) = match outcome {
        ParkOutcome::Selected {
            option_id,
            kind,
            auto,
        } => (
            format!("selected:{}", option_kind_name(kind)),
            auto,
            Some(option_id),
        ),
        ParkOutcome::Cancelled => ("cancelled".to_string(), true, None),
        ParkOutcome::Timeout => ("timeout".to_string(), true, None),
    };
    emit(
        sink,
        AgentEvent::PermissionResolved {
            request_id: request_id.to_string(),
            outcome: outcome_text,
            auto,
        },
    );
    option_id
}

fn describe(error: &agent_client_protocol::Error) -> String {
    match error.data.as_ref().and_then(serde_json::Value::as_str) {
        Some(detail) => format!("{}: {detail}", error.message),
        None => error.message.to_string(),
    }
}

fn with_stderr_tail(message: &str, stderr: &Arc<Mutex<VecDeque<String>>>) -> String {
    let joined = stderr
        .lock()
        .unwrap()
        .iter()
        .filter(|line| !line.trim().is_empty())
        .cloned()
        .collect::<Vec<_>>()
        .join("\n");
    // The ring holds whole lines, which a crashing agent can make arbitrarily
    // long; the clamp keeps the last of it, where the actual failure is.
    let tail = clamp_stderr(&joined);
    if tail.is_empty() {
        message.to_string()
    } else {
        format!("{message}\n{tail}")
    }
}
