use crate::features::ai::agent_stream::{AgentEvent, ToolSelector};
use crate::features::ai::harness::codex_adapter::{build_codex_args, CodexAdapter, CodexEventParser};
use crate::features::ai::harness::{HarnessAdapter, HarnessEventParser, McpEndpoint};
use crate::features::mcp::types::{InputSchema, ToolDefinition};

// Fixture lines captured from a real `codex exec --json` run (codex-cli 0.144.3),
// trimmed of irrelevant fields but structurally verbatim. Item schemas
// (agent_message / reasoning / mcp_tool_call / command_execution) match the
// item-type enum and field names extracted from the shipped binary.
const THREAD_STARTED_LINE: &str =
    r#"{"type":"thread.started","thread_id":"019f92ba-aad1-7502-8790-89ed50466b65"}"#;

const TURN_STARTED_LINE: &str = r#"{"type":"turn.started"}"#;

const AGENT_MESSAGE_LINE: &str =
    r#"{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"hello from codex"}}"#;

const REASONING_LINE: &str =
    r#"{"type":"item.completed","item":{"id":"item_2","type":"reasoning","text":"pondering"}}"#;

const MCP_TOOL_START_LINE: &str = r#"{"type":"item.started","item":{"id":"item_3","type":"mcp_tool_call","invocation":{"server":"carbide","tool":"read_note","arguments":{"path":"hello.md"}}}}"#;

const MCP_TOOL_END_LINE: &str = r#"{"type":"item.completed","item":{"id":"item_3","type":"mcp_tool_call","invocation":{"server":"carbide","tool":"read_note"},"status":"completed"}}"#;

const SHELL_TOOL_END_FAIL_LINE: &str = r#"{"type":"item.completed","item":{"id":"item_4","type":"command_execution","command":"ls /nope","exit_code":1,"status":"failed"}}"#;

const TURN_COMPLETED_LINE: &str =
    r#"{"type":"turn.completed","usage":{"input_tokens":10,"cached_input_tokens":0,"output_tokens":5}}"#;

const TURN_FAILED_LINE: &str =
    r#"{"type":"turn.failed","error":{"message":"unexpected status 401 Unauthorized"}}"#;

const TRANSIENT_ERROR_LINE: &str = r#"{"type":"error","message":"Reconnecting... 1/5"}"#;

const ERROR_ITEM_LINE: &str = r#"{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Falling back from WebSockets to HTTPS transport."}}"#;

#[test]
fn thread_started_yields_init_with_session_id() {
    let mut parser = CodexEventParser::default();
    assert_eq!(
        parser.parse_line(THREAD_STARTED_LINE),
        vec![AgentEvent::Init {
            session_id: "019f92ba-aad1-7502-8790-89ed50466b65".to_string()
        }]
    );
}

#[test]
fn agent_message_yields_text() {
    let mut parser = CodexEventParser::default();
    assert_eq!(
        parser.parse_line(AGENT_MESSAGE_LINE),
        vec![AgentEvent::Text {
            delta: "hello from codex".to_string()
        }]
    );
}

#[test]
fn reasoning_yields_reasoning() {
    let mut parser = CodexEventParser::default();
    assert_eq!(
        parser.parse_line(REASONING_LINE),
        vec![AgentEvent::Reasoning {
            delta: "pondering".to_string()
        }]
    );
}

#[test]
fn mcp_tool_start_yields_tool_start_with_carbide_prefixed_name() {
    let mut parser = CodexEventParser::default();
    let events = parser.parse_line(MCP_TOOL_START_LINE);
    assert_eq!(events.len(), 1);
    match &events[0] {
        AgentEvent::ToolStart {
            name,
            input_summary,
        } => {
            assert_eq!(name, "mcp__carbide__read_note");
            assert!(input_summary.contains("hello.md"));
        }
        other => panic!("expected ToolStart, got {other:?}"),
    }
}

#[test]
fn mcp_tool_end_yields_tool_end_matched_by_id() {
    let mut parser = CodexEventParser::default();
    parser.parse_line(MCP_TOOL_START_LINE);
    assert_eq!(
        parser.parse_line(MCP_TOOL_END_LINE),
        vec![AgentEvent::ToolEnd {
            name: "mcp__carbide__read_note".to_string(),
            ok: true,
            result_summary: None,
        }]
    );
}

#[test]
fn failed_command_execution_yields_tool_end_not_ok() {
    let mut parser = CodexEventParser::default();
    assert_eq!(
        parser.parse_line(SHELL_TOOL_END_FAIL_LINE),
        vec![AgentEvent::ToolEnd {
            name: "command_execution".to_string(),
            ok: false,
            result_summary: None,
        }]
    );
}

#[test]
fn turn_completed_yields_done() {
    let mut parser = CodexEventParser::default();
    let events = parser.parse_line(TURN_COMPLETED_LINE);
    assert_eq!(events.len(), 1);
    assert!(matches!(events[0], AgentEvent::Done { .. }));
}

#[test]
fn turn_failed_yields_error() {
    let mut parser = CodexEventParser::default();
    assert_eq!(
        parser.parse_line(TURN_FAILED_LINE),
        vec![AgentEvent::Error {
            message: "unexpected status 401 Unauthorized".to_string()
        }]
    );
}

// Transient reconnect noise and diagnostic error items must NOT become a
// terminal AgentEvent::Error — the runner ends the turn on the first Error,
// so surfacing these would abort a healthy turn. Only turn.failed is terminal.
#[test]
fn transient_noise_yields_no_events() {
    let mut parser = CodexEventParser::default();
    assert!(parser.parse_line(TURN_STARTED_LINE).is_empty());
    assert!(parser.parse_line(TRANSIENT_ERROR_LINE).is_empty());
    assert!(parser.parse_line(ERROR_ITEM_LINE).is_empty());
    assert!(parser.parse_line("not json at all").is_empty());
}

#[test]
fn saw_result_tracks_turn_terminals() {
    let mut parser = CodexEventParser::default();
    assert!(!parser.saw_result());
    parser.parse_line(AGENT_MESSAGE_LINE);
    assert!(!parser.saw_result());
    parser.parse_line(TURN_COMPLETED_LINE);
    assert!(parser.saw_result());
}

fn flag_value<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1))
        .map(String::as_str)
}

fn config_value<'a>(args: &'a [String], key: &str) -> Option<&'a str> {
    let prefix = format!("{key}=");
    args.iter()
        .filter_map(|a| a.strip_prefix(&prefix))
        .next()
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

fn sample_catalog() -> Vec<ToolDefinition> {
    vec![
        tool_def("search_notes", false),
        tool_def("read_note", false),
        tool_def("create_note", true),
    ]
}

#[test]
fn base_args_match_verified_cli_contract() {
    let args = build_codex_args("do the thing", 3457, &ToolSelector::ReadOnly, &sample_catalog())
        .unwrap();
    // Non-interactive JSONL exec, outside-git allowed, user config never loaded.
    assert_eq!(args[0], "exec");
    assert!(args.contains(&"--json".to_string()));
    assert!(args.contains(&"--skip-git-repo-check".to_string()));
    assert!(args.contains(&"--ignore-user-config".to_string()));
    // MCP server injected purely via -c overrides (no config file, no user path).
    assert_eq!(
        config_value(&args, "mcp_servers.carbide.url"),
        Some("\"http://127.0.0.1:3457/mcp\"")
    );
    assert_eq!(
        config_value(&args, "mcp_servers.carbide.bearer_token_env_var"),
        Some("\"CARBIDE_MCP_TOKEN\"")
    );
    // Prompt is the trailing positional after the end-of-options marker.
    assert_eq!(args.last().map(String::as_str), Some("do the thing"));
    let dashdash = args.iter().position(|a| a == "--").unwrap();
    assert_eq!(dashdash, args.len() - 2);
}

#[test]
fn safe_mode_uses_read_only_sandbox_and_non_mutating_allow_list() {
    let args =
        build_codex_args("go", 3457, &ToolSelector::ReadOnly, &sample_catalog()).unwrap();
    assert_eq!(flag_value(&args, "--sandbox"), Some("read-only"));
    // enabled_tools restricts codex to the non-mutating carbide tools (bare names,
    // no mcp__carbide__ prefix — the filter is already scoped to the server).
    let enabled = config_value(&args, "mcp_servers.carbide.enabled_tools").unwrap();
    assert!(enabled.contains("read_note"));
    assert!(enabled.contains("search_notes"));
    assert!(
        !enabled.contains("create_note"),
        "mutating create_note must never reach codex's enabled_tools"
    );
    assert!(!enabled.contains("mcp__carbide__"));
}

#[test]
fn only_selector_restricts_enabled_tools_to_named_set() {
    let selector = ToolSelector::Only {
        names: vec!["read_note".to_string()],
    };
    let args = build_codex_args("go", 3457, &selector, &sample_catalog()).unwrap();
    assert_eq!(flag_value(&args, "--sandbox"), Some("read-only"));
    let enabled = config_value(&args, "mcp_servers.carbide.enabled_tools").unwrap();
    assert!(enabled.contains("read_note"));
    assert!(!enabled.contains("search_notes"));
}

#[test]
fn power_mode_uses_workspace_write_and_no_tool_filter() {
    let args = build_codex_args("go", 3457, &ToolSelector::Full, &sample_catalog()).unwrap();
    assert_eq!(flag_value(&args, "--sandbox"), Some("workspace-write"));
    assert!(config_value(&args, "mcp_servers.carbide.enabled_tools").is_none());
}

// Ephemeral-config invariant: the bearer token is delivered via the child's
// environment (never argv), and the whole invocation is argv + env only — no
// config file is written and no user-config path is referenced.
#[test]
fn invocation_is_ephemeral_token_in_env_not_argv() {
    let endpoint = McpEndpoint {
        port: 3457,
        token: "super-secret-token".to_string(),
    };
    let invocation = CodexAdapter
        .build_invocation("go", &endpoint, &ToolSelector::ReadOnly, &sample_catalog(), None)
        .unwrap();

    assert!(
        invocation
            .env
            .iter()
            .any(|(k, v)| k == "CARBIDE_MCP_TOKEN" && v == "super-secret-token"),
        "token must be passed via the CARBIDE_MCP_TOKEN env var"
    );
    assert!(
        !invocation.args.iter().any(|a| a.contains("super-secret-token")),
        "token must never appear in argv"
    );
    assert!(
        !invocation.args.iter().any(|a| a.contains(".codex")),
        "invocation must not reference the user's codex config"
    );
}

#[test]
fn adapter_capability_consts_reflect_exec_json_reality() {
    assert!(!CodexAdapter::SUPPORTS_RESUME);
    assert!(!CodexAdapter::SUPPORTS_PARTIAL_TEXT);
}
