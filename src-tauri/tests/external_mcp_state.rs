use carbide::features::external_mcp::{ExternalMcpConfig, ExternalMcpState};

fn mock_mcp_config() -> ExternalMcpConfig {
    // A Python one-liner that acts as a minimal MCP server:
    // reads JSON-RPC lines from stdin, responds to requests (has "id"),
    // ignores notifications (no "id").
    ExternalMcpConfig {
        binary: "python3".to_string(),
        args: vec![
            "-c".to_string(),
            r#"
import sys, json
while True:
    line = sys.stdin.readline()
    if not line:
        break
    msg = json.loads(line)
    if "id" not in msg:
        continue
    method = msg.get("method", "")
    if method == "initialize":
        resp = {"jsonrpc":"2.0","id":msg["id"],"result":{"protocolVersion":"2024-11-05","serverInfo":{"name":"mock"},"capabilities":{}}}
    elif method == "tools/list":
        resp = {"jsonrpc":"2.0","id":msg["id"],"result":{"tools":[{"name":"test_tool","description":"A test tool","inputSchema":{"type":"object"}}]}}
    elif method == "tools/call":
        resp = {"jsonrpc":"2.0","id":msg["id"],"result":{"content":[{"type":"text","text":"ok"}]}}
    else:
        resp = {"jsonrpc":"2.0","id":msg["id"],"result":{}}
    sys.stdout.write(json.dumps(resp) + "\n")
    sys.stdout.flush()
"#
            .to_string(),
        ],
        env_vars: vec![],
        working_dir: None,
        request_timeout_ms: 10_000,
        init_timeout_ms: 10_000,
    }
}

#[tokio::test]
async fn status_returns_stopped_for_unknown_server() {
    let state = ExternalMcpState::default();
    let status = state.status("nonexistent").await;
    match status {
        carbide::features::external_mcp::ExternalMcpStatus::Stopped => {}
        other => panic!("Expected Stopped, got {:?}", other),
    }
}

#[tokio::test]
async fn start_stop_lifecycle() {
    let state = ExternalMcpState::default();

    state
        .start("test-server".to_string(), mock_mcp_config())
        .await
        .expect("start should succeed");

    let status = state.status("test-server").await;
    match status {
        carbide::features::external_mcp::ExternalMcpStatus::Running { tool_count } => {
            assert_eq!(tool_count, 1, "mock provides 1 tool");
        }
        other => panic!("Expected Running, got {:?}", other),
    }

    state
        .stop("test-server")
        .await
        .expect("stop should succeed");

    let status = state.status("test-server").await;
    match status {
        carbide::features::external_mcp::ExternalMcpStatus::Stopped => {}
        other => panic!("Expected Stopped after stop, got {:?}", other),
    }
}

#[tokio::test]
async fn start_duplicate_returns_already_running() {
    let state = ExternalMcpState::default();

    state
        .start("dup-server".to_string(), mock_mcp_config())
        .await
        .expect("first start should succeed");

    let err = state
        .start("dup-server".to_string(), mock_mcp_config())
        .await
        .expect_err("second start should fail");

    assert!(
        format!("{}", err).contains("already running"),
        "Expected AlreadyRunning error, got: {}",
        err
    );

    // Cleanup
    state.stop("dup-server").await.expect("cleanup stop");
}

#[tokio::test]
async fn stop_unknown_server_returns_not_found() {
    let state = ExternalMcpState::default();

    let err = state
        .stop("does-not-exist")
        .await
        .expect_err("stop unknown should fail");

    assert!(
        format!("{}", err).contains("not found"),
        "Expected ServerNotFound, got: {}",
        err
    );
}

#[tokio::test]
async fn call_tool_on_running_server() {
    let state = ExternalMcpState::default();

    state
        .start("tool-server".to_string(), mock_mcp_config())
        .await
        .expect("start should succeed");

    let result = state
        .call_tool("tool-server", "test_tool", serde_json::json!({"input": "hello"}))
        .await
        .expect("call_tool should succeed");

    assert!(result.get("content").is_some(), "Expected content in response");

    state.stop("tool-server").await.expect("cleanup stop");
}

#[tokio::test]
async fn shutdown_stops_all_servers() {
    let state = ExternalMcpState::default();

    state
        .start("srv-a".to_string(), mock_mcp_config())
        .await
        .expect("start a");
    state
        .start("srv-b".to_string(), mock_mcp_config())
        .await
        .expect("start b");

    state.shutdown().await;

    match state.status("srv-a").await {
        carbide::features::external_mcp::ExternalMcpStatus::Stopped => {}
        other => panic!("Expected Stopped after shutdown, got {:?}", other),
    }
    match state.status("srv-b").await {
        carbide::features::external_mcp::ExternalMcpStatus::Stopped => {}
        other => panic!("Expected Stopped after shutdown, got {:?}", other),
    }
}

#[tokio::test]
async fn start_fails_with_invalid_binary() {
    let state = ExternalMcpState::default();
    let config = ExternalMcpConfig {
        binary: "/nonexistent/binary/path".to_string(),
        args: vec![],
        env_vars: vec![],
        working_dir: None,
        request_timeout_ms: 5_000,
        init_timeout_ms: 5_000,
    };

    let err = state
        .start("bad-server".to_string(), config)
        .await
        .expect_err("start with bad binary should fail");

    assert!(
        format!("{}", err).contains("spawn failed"),
        "Expected ProcessSpawnFailed, got: {}",
        err
    );
}
