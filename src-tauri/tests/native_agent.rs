use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use futures_util::{stream, Stream};
use serde_json::Value;
use tokio::sync::oneshot;

use crate::features::ai::agent_stream::{AgentEvent, ToolSelector};
use crate::features::ai::native_agent::{
    allowed_tools, evict_history, run_native_turn, truncate_tool_result, ModelClient,
    HISTORY_MAX_CHARS, HISTORY_MAX_MESSAGES, MAX_ITERATIONS, TOOL_RESULT_MAX_CHARS,
};
use crate::features::ai::stream::{AiMessage, AiMessageContent, AiStreamEvent, AiToolCall};
use crate::features::mcp::types::{InputSchema, ToolDefinition, ToolResult};

struct FakeClient {
    turns: Arc<Mutex<VecDeque<Vec<AiStreamEvent>>>>,
    seen_tools: Arc<Mutex<Vec<Vec<String>>>>,
}

impl ModelClient for FakeClient {
    fn stream_turn(
        &self,
        _messages: Vec<AiMessage>,
        tools: Vec<ToolDefinition>,
    ) -> impl Stream<Item = AiStreamEvent> + Send {
        self.seen_tools
            .lock()
            .unwrap()
            .push(tools.iter().map(|t| t.name.clone()).collect());
        let events = self.turns.lock().unwrap().pop_front().unwrap_or_default();
        stream::iter(events)
    }
}

struct AlwaysToolClient {
    calls: Arc<Mutex<u32>>,
}

impl ModelClient for AlwaysToolClient {
    fn stream_turn(
        &self,
        _messages: Vec<AiMessage>,
        _tools: Vec<ToolDefinition>,
    ) -> impl Stream<Item = AiStreamEvent> + Send {
        let n = {
            let mut guard = self.calls.lock().unwrap();
            *guard += 1;
            *guard
        };
        stream::iter(vec![AiStreamEvent::ToolCall {
            id: format!("call-{n}"),
            name: "search".into(),
            arguments: "{}".into(),
        }])
    }
}

fn tool_def(name: &str, mutating: bool) -> ToolDefinition {
    ToolDefinition {
        name: name.to_string(),
        description: String::new(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties: Default::default(),
            required: Vec::new(),
        },
        mutating,
    }
}

fn text_turn(text: &str) -> Vec<AiStreamEvent> {
    vec![AiStreamEvent::Text { text: text.into() }]
}

fn call_turn(id: &str, name: &str, args: &str) -> Vec<AiStreamEvent> {
    vec![AiStreamEvent::ToolCall {
        id: id.into(),
        name: name.into(),
        arguments: args.into(),
    }]
}

fn tag(event: &AgentEvent) -> &'static str {
    match event {
        AgentEvent::Init { .. } => "init",
        AgentEvent::Text { .. } => "text",
        AgentEvent::ToolStart { .. } => "tool_start",
        AgentEvent::Reasoning { .. } => "reasoning",
        AgentEvent::ToolEnd { .. } => "tool_end",
        AgentEvent::Done { .. } => "done",
        AgentEvent::Error { .. } => "error",
    }
}

async fn drive<C, D>(
    client: C,
    catalog: Vec<ToolDefinition>,
    selector: ToolSelector,
    dispatch: D,
    abort_rx: oneshot::Receiver<()>,
) -> Vec<AgentEvent>
where
    C: ModelClient,
    D: FnMut(&str, Option<&Value>) -> ToolResult,
{
    let events = Arc::new(Mutex::new(Vec::new()));
    let sink = events.clone();
    let emit = move |event: AgentEvent| sink.lock().unwrap().push(event);
    run_native_turn(
        client,
        dispatch,
        "sess".into(),
        "sys".into(),
        Vec::new(),
        catalog,
        selector,
        abort_rx,
        emit,
    )
    .await;
    let out = events.lock().unwrap().clone();
    out
}

fn scripted(turns: Vec<Vec<AiStreamEvent>>) -> (FakeClient, Arc<Mutex<Vec<Vec<String>>>>) {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let client = FakeClient {
        turns: Arc::new(Mutex::new(turns.into())),
        seen_tools: seen.clone(),
    };
    (client, seen)
}

fn ok_dispatch() -> impl FnMut(&str, Option<&Value>) -> ToolResult {
    |_name: &str, _args: Option<&Value>| ToolResult::text("result".into())
}

fn done_num_turns(events: &[AgentEvent]) -> u32 {
    match events.last() {
        Some(AgentEvent::Done { stats }) => stats.num_turns,
        other => panic!("expected done, got {other:?}"),
    }
}

#[tokio::test]
async fn scenario_1_happy_path_event_order() {
    let (client, _seen) = scripted(vec![call_turn("c1", "search", "{}"), text_turn("answer")]);
    let (_tx, rx) = oneshot::channel();
    let events = drive(
        client,
        vec![tool_def("search", false)],
        ToolSelector::Full,
        ok_dispatch(),
        rx,
    )
    .await;

    let tags: Vec<&str> = events.iter().map(tag).collect();
    assert_eq!(tags, ["init", "tool_start", "tool_end", "text", "done"]);
    assert!(matches!(
        events[2],
        AgentEvent::ToolEnd { ok: true, .. }
    ));
    assert_eq!(done_num_turns(&events), 2);
}

#[tokio::test]
async fn scenario_2_safe_mode_withholds_and_refuses_hallucinated_call() {
    let (client, seen) = scripted(vec![call_turn("c1", "write_note", "{}"), text_turn("ok")]);
    let dispatched = Arc::new(Mutex::new(Vec::<String>::new()));
    let log = dispatched.clone();
    let dispatch = move |name: &str, _args: Option<&Value>| {
        log.lock().unwrap().push(name.to_string());
        ToolResult::text("result".into())
    };
    let (_tx, rx) = oneshot::channel();

    let events = drive(
        client,
        vec![tool_def("search", false), tool_def("write_note", true)],
        ToolSelector::ReadOnly,
        dispatch,
        rx,
    )
    .await;

    let first_call_tools = &seen.lock().unwrap()[0];
    assert!(
        !first_call_tools.contains(&"write_note".to_string()),
        "mutating tool must be withheld in safe mode"
    );
    assert!(first_call_tools.contains(&"search".to_string()));
    assert!(
        dispatched.lock().unwrap().is_empty(),
        "hallucinated call must not be dispatched"
    );
    assert!(events
        .iter()
        .any(|e| matches!(e, AgentEvent::ToolEnd { ok: false, name, .. } if name == "write_note")));
    assert!(matches!(events.last(), Some(AgentEvent::Done { .. })));
}

#[tokio::test]
async fn scenario_3_power_mode_dispatches_mutating_tool() {
    let (client, seen) = scripted(vec![call_turn("c1", "write_note", "{}"), text_turn("done")]);
    let dispatched = Arc::new(Mutex::new(Vec::<String>::new()));
    let log = dispatched.clone();
    let dispatch = move |name: &str, _args: Option<&Value>| {
        log.lock().unwrap().push(name.to_string());
        ToolResult::text("wrote note".into())
    };
    let (_tx, rx) = oneshot::channel();

    let events = drive(
        client,
        vec![tool_def("search", false), tool_def("write_note", true)],
        ToolSelector::Full,
        dispatch,
        rx,
    )
    .await;

    assert!(seen.lock().unwrap()[0].contains(&"write_note".to_string()));
    assert_eq!(dispatched.lock().unwrap().as_slice(), ["write_note"]);
    assert!(events
        .iter()
        .any(|e| matches!(e, AgentEvent::ToolEnd { ok: true, name, .. } if name == "write_note")));
    assert!(matches!(events.last(), Some(AgentEvent::Done { .. })));
}

#[tokio::test]
async fn scenario_4_tool_error_recovery() {
    let (client, _seen) = scripted(vec![
        call_turn("c1", "search", "{bad"),
        call_turn("c2", "search", "{}"),
        text_turn("recovered"),
    ]);
    let count = Arc::new(Mutex::new(0u32));
    let c = count.clone();
    let dispatch = move |_name: &str, _args: Option<&Value>| {
        let mut n = c.lock().unwrap();
        *n += 1;
        if *n == 1 {
            ToolResult::error("bad arguments".into())
        } else {
            ToolResult::text("results".into())
        }
    };
    let (_tx, rx) = oneshot::channel();

    let events = drive(
        client,
        vec![tool_def("search", false)],
        ToolSelector::Full,
        dispatch,
        rx,
    )
    .await;

    assert_eq!(*count.lock().unwrap(), 2);
    let tool_ends: Vec<bool> = events
        .iter()
        .filter_map(|e| match e {
            AgentEvent::ToolEnd { ok, .. } => Some(*ok),
            _ => None,
        })
        .collect();
    assert_eq!(tool_ends, [false, true]);
    assert!(matches!(events.last(), Some(AgentEvent::Done { .. })));
}

#[tokio::test]
async fn scenario_5_max_iterations_cap() {
    let client = AlwaysToolClient {
        calls: Arc::new(Mutex::new(0)),
    };
    let (_tx, rx) = oneshot::channel();

    let events = drive(
        client,
        vec![tool_def("search", false)],
        ToolSelector::Full,
        ok_dispatch(),
        rx,
    )
    .await;

    assert!(
        !events.iter().any(|e| matches!(e, AgentEvent::Error { .. })),
        "cap must not surface an error"
    );
    assert_eq!(done_num_turns(&events), MAX_ITERATIONS);
}

#[tokio::test]
async fn scenario_6_abort_between_tool_calls_stops_dispatch() {
    let (client, _seen) = scripted(vec![vec![
        AiStreamEvent::ToolCall {
            id: "a".into(),
            name: "search".into(),
            arguments: "{}".into(),
        },
        AiStreamEvent::ToolCall {
            id: "b".into(),
            name: "search".into(),
            arguments: "{}".into(),
        },
    ]]);
    let (abort_tx, abort_rx) = oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(abort_tx)));
    let dispatched = Arc::new(Mutex::new(Vec::<String>::new()));
    let log = dispatched.clone();
    let tx = sender.clone();
    let dispatch = move |name: &str, _args: Option<&Value>| {
        log.lock().unwrap().push(name.to_string());
        if let Some(s) = tx.lock().unwrap().take() {
            let _ = s.send(());
        }
        ToolResult::text("result".into())
    };

    let events = drive(
        client,
        vec![tool_def("search", false)],
        ToolSelector::Full,
        dispatch,
        abort_rx,
    )
    .await;

    assert_eq!(
        dispatched.lock().unwrap().len(),
        1,
        "second tool call must not dispatch after abort"
    );
    assert!(matches!(
        events.last(),
        Some(AgentEvent::Error { message }) if message == "aborted"
    ));
}

#[tokio::test]
async fn scenario_8_oversized_tool_result_truncated_with_marker() {
    let oversized = "x".repeat(TOOL_RESULT_MAX_CHARS + 500);
    let truncated = truncate_tool_result(&oversized);

    assert!(truncated.starts_with(&"x".repeat(TOOL_RESULT_MAX_CHARS)));
    assert!(truncated.contains("truncated"));
    let data: String = truncated.chars().take_while(|c| *c == 'x').collect();
    assert_eq!(data.chars().count(), TOOL_RESULT_MAX_CHARS);

    let small = "short";
    assert_eq!(truncate_tool_result(small), small);
}

#[test]
fn read_only_selector_excludes_mutating_tools() {
    let catalog = vec![tool_def("search", false), tool_def("create_note", true)];
    let allowed = allowed_tools(&catalog, &ToolSelector::ReadOnly);
    let names: Vec<&str> = allowed.iter().map(|t| t.name.as_str()).collect();
    assert_eq!(names, ["search"], "ReadOnly must drop mutating create_note");
}

#[test]
fn full_selector_keeps_entire_catalog() {
    let catalog = vec![tool_def("search", false), tool_def("create_note", true)];
    let allowed = allowed_tools(&catalog, &ToolSelector::Full);
    assert_eq!(allowed.len(), 2, "Full must keep every tool including mutating");
}

#[test]
fn only_selector_keeps_named_tools() {
    let catalog = vec![
        tool_def("search", false),
        tool_def("read_note", false),
        tool_def("create_note", true),
    ];
    let allowed = allowed_tools(
        &catalog,
        &ToolSelector::Only {
            names: vec!["read_note".to_string()],
        },
    );
    let names: Vec<&str> = allowed.iter().map(|t| t.name.as_str()).collect();
    assert_eq!(names, ["read_note"]);
}

fn spawn_sse_fixture_server(response: String) -> std::net::SocketAddr {
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
async fn wire_format_real_client_assembles_recorded_sse_fixture() {
    use futures_util::StreamExt;

    use crate::features::ai::native_agent::TransportModelClient;
    use crate::features::ai::service::{AiProviderConfig, AiTransport};

    let body = concat!(
        "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"content\":\"Let me search.\"}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"type\":\"function\",\"function\":{\"name\":\"search_notes\",\"arguments\":\"\"}}]}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"{\\\"que\"}}]}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"ry\\\":\\\"foo\\\"}\"}}]}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"tool_calls\"}]}\n\n",
        "data: [DONE]\n\n",
    );
    let addr = spawn_sse_fixture_server(format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n{body}"
    ));

    let config = AiProviderConfig {
        id: "native-agent-fixture-test".into(),
        name: "Fixture".into(),
        transport: AiTransport::Api {
            base_url: format!("http://{addr}/v1"),
            api_key_env: None,
        },
        model: Some("m".into()),
        install_url: None,
        is_preset: None,
    };

    let client = TransportModelClient::new(config);
    let messages = vec![AiMessage {
        role: "user".into(),
        content: "find foo".into(),
        tool_calls: None,
        tool_call_id: None,
    }];
    let mut stream = std::pin::pin!(client.stream_turn(messages, Vec::new()));
    let mut events = Vec::new();
    while let Some(event) = stream.next().await {
        events.push(event);
    }

    assert!(events
        .iter()
        .any(|e| matches!(e, AiStreamEvent::Text { text } if text == "Let me search.")));
    let tool_call = events
        .iter()
        .find_map(|e| match e {
            AiStreamEvent::ToolCall {
                id,
                name,
                arguments,
            } => Some((id.clone(), name.clone(), arguments.clone())),
            _ => None,
        })
        .expect("fixture stream must yield an assembled ToolCall");
    assert_eq!(tool_call.0, "call_1");
    assert_eq!(tool_call.1, "search_notes");
    let parsed: Value = serde_json::from_str(&tool_call.2).unwrap();
    assert_eq!(parsed["query"], "foo");
    assert!(matches!(events.last(), Some(AiStreamEvent::Done)));
}

struct RecordingClient {
    seen_messages: Arc<Mutex<Vec<Vec<AiMessage>>>>,
    turns: Arc<Mutex<VecDeque<Vec<AiStreamEvent>>>>,
}

impl ModelClient for RecordingClient {
    fn stream_turn(
        &self,
        messages: Vec<AiMessage>,
        _tools: Vec<ToolDefinition>,
    ) -> impl Stream<Item = AiStreamEvent> + Send {
        self.seen_messages.lock().unwrap().push(messages);
        let events = self.turns.lock().unwrap().pop_front().unwrap_or_default();
        stream::iter(events)
    }
}

fn user_msg(content: &str) -> AiMessage {
    AiMessage {
        role: "user".into(),
        content: content.into(),
        tool_calls: None,
        tool_call_id: None,
    }
}

fn assistant_call_msg(text: &str, id: &str) -> AiMessage {
    AiMessage {
        role: "assistant".into(),
        content: text.into(),
        tool_calls: Some(vec![AiToolCall {
            id: id.into(),
            name: "search".into(),
            arguments: "{}".into(),
        }]),
        tool_call_id: None,
    }
}

fn tool_result_msg(id: &str, content: &str) -> AiMessage {
    AiMessage {
        role: "tool".into(),
        content: content.into(),
        tool_calls: None,
        tool_call_id: Some(id.into()),
    }
}

fn content_text(message: &AiMessage) -> String {
    match &message.content {
        AiMessageContent::Text(text) => text.clone(),
        AiMessageContent::Parts(_) => String::new(),
    }
}

#[test]
fn evict_history_keeps_newest_and_preserves_order() {
    let history: Vec<AiMessage> = (0..HISTORY_MAX_MESSAGES + 2)
        .map(|i| user_msg(&format!("m{i}")))
        .collect();

    let kept = evict_history(history);

    assert_eq!(kept.len(), HISTORY_MAX_MESSAGES);
    assert_eq!(content_text(&kept[0]), "m2");
    assert_eq!(
        content_text(kept.last().unwrap()),
        format!("m{}", HISTORY_MAX_MESSAGES + 1)
    );
}

#[test]
fn evict_history_at_exact_count_cap_keeps_all() {
    let history: Vec<AiMessage> = (0..HISTORY_MAX_MESSAGES)
        .map(|i| user_msg(&format!("m{i}")))
        .collect();

    let kept = evict_history(history);

    assert_eq!(kept.len(), HISTORY_MAX_MESSAGES);
    assert_eq!(content_text(&kept[0]), "m0");
}

#[test]
fn evict_history_never_orphans_tool_result() {
    // Oldest is an assistant tool-call whose result follows; the count cap forces
    // the assistant out, so its now-orphaned tool result must go too.
    let mut history = vec![assistant_call_msg("searching", "c1"), tool_result_msg("c1", "hit")];
    history.extend((0..HISTORY_MAX_MESSAGES - 1).map(|i| user_msg(&format!("u{i}"))));

    let kept = evict_history(history);

    assert_eq!(kept.len(), HISTORY_MAX_MESSAGES - 1);
    assert!(kept.iter().all(|m| m.role != "tool"));
    assert_eq!(content_text(&kept[0]), "u0");
}

#[test]
fn evict_history_drops_tool_group_exceeding_char_cap() {
    let oversized = "x".repeat(HISTORY_MAX_CHARS);
    let history = vec![
        user_msg("older"),
        assistant_call_msg("call", "c1"),
        tool_result_msg("c1", &oversized),
    ];

    let kept = evict_history(history);

    // The assistant+tool unit is 1 char over the cap, so the whole unit is
    // dropped; keeping the tool result alone would orphan its tool_call_id.
    assert!(kept.is_empty());
}

#[test]
fn evict_history_at_exact_char_cap_keeps_both() {
    let half = "y".repeat(HISTORY_MAX_CHARS / 2);
    let history = vec![user_msg(&half), user_msg(&half)];

    let kept = evict_history(history);

    assert_eq!(kept.len(), 2);
}

#[tokio::test]
async fn replay_history_reaches_model_system_first() {
    let seen_messages = Arc::new(Mutex::new(Vec::new()));
    let client = RecordingClient {
        seen_messages: seen_messages.clone(),
        turns: Arc::new(Mutex::new(vec![text_turn("final answer")].into())),
    };
    // Turn-1 transcript followed by the turn-2 prompt, exactly as spawn_native_turn
    // assembles it (evicted replay + appended user prompt).
    let history = vec![
        user_msg("turn one question"),
        assistant_call_msg("let me search", "c1"),
        tool_result_msg("c1", "search result"),
        user_msg("turn two question"),
    ];
    let (_tx, rx) = oneshot::channel();
    let events = Arc::new(Mutex::new(Vec::new()));
    let sink = events.clone();
    let emit = move |event: AgentEvent| sink.lock().unwrap().push(event);

    run_native_turn(
        client,
        ok_dispatch(),
        "sess".into(),
        "sys".into(),
        history,
        vec![tool_def("search", false)],
        ToolSelector::Full,
        rx,
        emit,
    )
    .await;

    let recorded = seen_messages.lock().unwrap();
    let first = &recorded[0];
    let roles: Vec<&str> = first.iter().map(|m| m.role.as_str()).collect();
    assert_eq!(roles, ["system", "user", "assistant", "tool", "user"]);
    assert_eq!(content_text(&first[0]), "sys");
    assert_eq!(content_text(&first[1]), "turn one question");
    assert_eq!(first[2].tool_calls.as_ref().unwrap()[0].id, "c1");
    assert_eq!(content_text(&first[3]), "search result");
    assert_eq!(first[3].tool_call_id.as_deref(), Some("c1"));
    assert_eq!(content_text(&first[4]), "turn two question");
}
