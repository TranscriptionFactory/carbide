use crate::features::ai::agent_stream::{
    build_agent_args, AgentEvent, AgentEventParser, AgentPermissionMode,
};

// Fixture lines captured from a real `claude -p ... --output-format stream-json
// --verbose --include-partial-messages` run (claude 2.1.205), trimmed of
// irrelevant fields but structurally verbatim.
const INIT_LINE: &str = r#"{"type":"system","subtype":"init","cwd":"/home/user/vault","session_id":"16c61d1b-fe47-4d2a-a97a-fdea9213ac86","tools":["Read"],"mcp_servers":[{"name":"carbide","status":"connected"}],"model":"claude-fable-5","permissionMode":"default"}"#;

const TEXT_DELTA_LINE: &str = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"hello"}},"session_id":"16c61d1b-fe47-4d2a-a97a-fdea9213ac86","parent_tool_use_id":null,"uuid":"91d270d2-e911-440f-b9ff-1bec52c085c0"}"#;

const THINKING_DELTA_LINE: &str = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"pondering"}},"session_id":"16c61d1b-fe47-4d2a-a97a-fdea9213ac86","parent_tool_use_id":null,"uuid":"fe8a0d37-2668-412b-9129-c10ff2fd987a"}"#;

const HOOK_LINE: &str = r#"{"type":"system","subtype":"hook_started","session_id":"16c61d1b-fe47-4d2a-a97a-fdea9213ac86","hook_name":"PreToolUse"}"#;

const TOOL_USE_LINE: &str = r#"{"type":"assistant","message":{"model":"claude-fable-5","id":"msg_011CdGB95pbKQUEY1MwS9Wqf","type":"message","role":"assistant","content":[{"type":"tool_use","id":"toolu_01M38CzXbA7gWUhWz4BCRZfM","name":"Read","input":{"file_path":"/home/user/vault/hello.txt"},"caller":{"type":"direct"}}],"stop_reason":null},"parent_tool_use_id":null,"session_id":"16c61d1b-fe47-4d2a-a97a-fdea9213ac86","uuid":"3f47f2ef-55af-4367-a49b-8187a6da2577"}"#;

const TOOL_RESULT_LINE: &str = r#"{"type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_01M38CzXbA7gWUhWz4BCRZfM","type":"tool_result","content":"1\thi from file\n2\t"}]},"parent_tool_use_id":null,"session_id":"16c61d1b-fe47-4d2a-a97a-fdea9213ac86","uuid":"aa209afc-9d7a-4966-afd4-e55f6921d9c8"}"#;

const TOOL_RESULT_ERROR_LINE: &str = r#"{"type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_01M38CzXbA7gWUhWz4BCRZfM","type":"tool_result","content":"File does not exist.","is_error":true}]},"parent_tool_use_id":null,"session_id":"16c61d1b-fe47-4d2a-a97a-fdea9213ac86","uuid":"aa209afc-9d7a-4966-afd4-e55f6921d9c8"}"#;

const RESULT_SUCCESS_LINE: &str = r#"{"type":"result","subtype":"success","is_error":false,"duration_ms":8929,"duration_api_ms":7277,"num_turns":2,"result":"Contents: `hi from file`","stop_reason":"end_turn","session_id":"16c61d1b-fe47-4d2a-a97a-fdea9213ac86","total_cost_usd":0.655998,"permission_denials":[],"uuid":"89c43dbd-2d86-4555-9e08-126929450664"}"#;

const RESULT_ERROR_LINE: &str = r#"{"type":"result","subtype":"error_during_execution","is_error":true,"duration_ms":1200,"num_turns":1,"result":"Execution failed","session_id":"16c61d1b-fe47-4d2a-a97a-fdea9213ac86","uuid":"89c43dbd-2d86-4555-9e08-126929450664"}"#;

#[test]
fn init_line_yields_init_with_session_id() {
    let mut parser = AgentEventParser::default();
    assert_eq!(
        parser.parse_line(INIT_LINE),
        vec![AgentEvent::Init {
            session_id: "16c61d1b-fe47-4d2a-a97a-fdea9213ac86".to_string()
        }]
    );
}

#[test]
fn text_delta_line_yields_text() {
    let mut parser = AgentEventParser::default();
    assert_eq!(
        parser.parse_line(TEXT_DELTA_LINE),
        vec![AgentEvent::Text {
            delta: "hello".to_string()
        }]
    );
}

#[test]
fn tool_use_line_yields_tool_start_with_input_summary() {
    let mut parser = AgentEventParser::default();
    let events = parser.parse_line(TOOL_USE_LINE);
    assert_eq!(events.len(), 1);
    match &events[0] {
        AgentEvent::ToolStart {
            name,
            input_summary,
        } => {
            assert_eq!(name, "Read");
            assert!(input_summary.contains("/home/user/vault/hello.txt"));
        }
        other => panic!("expected ToolStart, got {other:?}"),
    }
}

#[test]
fn tool_result_line_yields_tool_end_matched_by_id() {
    let mut parser = AgentEventParser::default();
    parser.parse_line(TOOL_USE_LINE);
    assert_eq!(
        parser.parse_line(TOOL_RESULT_LINE),
        vec![AgentEvent::ToolEnd {
            name: "Read".to_string(),
            ok: true
        }]
    );
}

#[test]
fn tool_result_error_yields_tool_end_not_ok() {
    let mut parser = AgentEventParser::default();
    parser.parse_line(TOOL_USE_LINE);
    assert_eq!(
        parser.parse_line(TOOL_RESULT_ERROR_LINE),
        vec![AgentEvent::ToolEnd {
            name: "Read".to_string(),
            ok: false
        }]
    );
}

#[test]
fn result_success_line_yields_done_with_stats() {
    let mut parser = AgentEventParser::default();
    let events = parser.parse_line(RESULT_SUCCESS_LINE);
    assert_eq!(events.len(), 1);
    match &events[0] {
        AgentEvent::Done { stats } => {
            assert_eq!(stats.duration_ms, 8929);
            assert_eq!(stats.num_turns, 2);
            assert!((stats.total_cost_usd - 0.655998).abs() < 1e-9);
        }
        other => panic!("expected Done, got {other:?}"),
    }
}

#[test]
fn result_error_line_yields_error() {
    let mut parser = AgentEventParser::default();
    assert_eq!(
        parser.parse_line(RESULT_ERROR_LINE),
        vec![AgentEvent::Error {
            message: "Execution failed".to_string()
        }]
    );
}

#[test]
fn noise_lines_yield_no_events() {
    let mut parser = AgentEventParser::default();
    assert!(parser.parse_line(THINKING_DELTA_LINE).is_empty());
    assert!(parser.parse_line(HOOK_LINE).is_empty());
    assert!(parser.parse_line("not json at all").is_empty());
    assert!(parser.parse_line(r#"{"type":"rate_limit_event"}"#).is_empty());
}

fn flag_value<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1))
        .map(String::as_str)
}

#[test]
fn base_args_match_verified_cli_contract() {
    let args = build_agent_args("do the thing", "/cfg/mcp.json", &AgentPermissionMode::Safe, None);
    assert_eq!(flag_value(&args, "-p"), Some("do the thing"));
    assert_eq!(flag_value(&args, "--output-format"), Some("stream-json"));
    assert!(args.contains(&"--verbose".to_string()));
    assert!(args.contains(&"--include-partial-messages".to_string()));
    assert!(args.contains(&"--strict-mcp-config".to_string()));
    assert_eq!(flag_value(&args, "--mcp-config"), Some("/cfg/mcp.json"));
}

#[test]
fn safe_mode_args_allow_carbide_tools_and_disallow_mutating_tools() {
    let args = build_agent_args("go", "/cfg/mcp.json", &AgentPermissionMode::Safe, None);
    assert_eq!(flag_value(&args, "--allowedTools"), Some("mcp__carbide__*"));
    let disallow_start = args.iter().position(|a| a == "--disallowedTools").unwrap();
    assert_eq!(&args[disallow_start + 1..disallow_start + 4], ["Bash", "Write", "Edit"]);
    assert!(!args.contains(&"--permission-mode".to_string()));
}

#[test]
fn power_mode_args_use_accept_edits_permission_mode() {
    let args = build_agent_args("go", "/cfg/mcp.json", &AgentPermissionMode::Power, None);
    assert_eq!(flag_value(&args, "--permission-mode"), Some("acceptEdits"));
    assert!(!args.contains(&"--allowedTools".to_string()));
    assert!(!args.contains(&"--disallowedTools".to_string()));
}

#[test]
fn resume_session_id_appends_resume_flag() {
    let sid = "16c61d1b-fe47-4d2a-a97a-fdea9213ac86";
    let args = build_agent_args("go", "/cfg/mcp.json", &AgentPermissionMode::Safe, Some(sid));
    assert_eq!(flag_value(&args, "--resume"), Some(sid));

    let args = build_agent_args("go", "/cfg/mcp.json", &AgentPermissionMode::Safe, None);
    assert!(!args.contains(&"--resume".to_string()));
}
