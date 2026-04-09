use crate::features::mcp::router::McpRouter;
use crate::features::mcp::types::*;
use serde_json::json;

fn make_request(method: &str, params: Option<serde_json::Value>, id: i64) -> JsonRpcRequest {
    JsonRpcRequest {
        jsonrpc: "2.0".into(),
        method: method.into(),
        params,
        id: Some(JsonRpcId::Number(id)),
    }
}

fn make_notification(method: &str) -> JsonRpcRequest {
    JsonRpcRequest {
        jsonrpc: "2.0".into(),
        method: method.into(),
        params: None,
        id: None,
    }
}

#[test]
fn ping_returns_empty_object() {
    let mut router = McpRouter::new();
    let req = make_request("ping", None, 1);
    let resp = router.handle_request(&req).unwrap();
    assert!(resp.error.is_none());
    assert_eq!(resp.result.unwrap(), json!({}));
}

#[test]
fn unknown_method_returns_error() {
    let mut router = McpRouter::new();
    let req = make_request("nonexistent/method", None, 1);
    let resp = router.handle_request(&req).unwrap();
    assert_eq!(resp.error.as_ref().unwrap().code, METHOD_NOT_FOUND);
}

#[test]
fn notification_returns_none() {
    let mut router = McpRouter::new();
    let req = make_notification("notifications/initialized");
    let resp = router.handle_request(&req);
    assert!(resp.is_none());
}

#[test]
fn initialize_succeeds() {
    let mut router = McpRouter::new();
    let req = make_request(
        "initialize",
        Some(json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": { "name": "test-client", "version": "1.0" }
        })),
        1,
    );
    let resp = router.handle_request(&req).unwrap();
    assert!(resp.error.is_none());
    let result = resp.result.unwrap();
    assert_eq!(result["protocolVersion"], "2024-11-05");
    assert_eq!(result["serverInfo"]["name"], "carbide");
    assert!(result["capabilities"]["tools"].is_object());
}

#[test]
fn initialize_without_params_returns_error() {
    let mut router = McpRouter::new();
    let req = make_request("initialize", None, 1);
    let resp = router.handle_request(&req).unwrap();
    assert_eq!(resp.error.as_ref().unwrap().code, INVALID_PARAMS);
}

#[test]
fn tools_list_returns_note_tools() {
    let mut router = McpRouter::new();
    let req = make_request("tools/list", None, 1);
    let resp = router.handle_request(&req).unwrap();
    assert!(resp.error.is_none());
    let result = resp.result.unwrap();
    let tools = result["tools"].as_array().unwrap();
    assert_eq!(tools.len(), 9);
    let names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
    assert!(names.contains(&"list_notes"));
    assert!(names.contains(&"read_note"));
    assert!(names.contains(&"create_note"));
    assert!(names.contains(&"update_note"));
    assert!(names.contains(&"delete_note"));
    assert!(names.contains(&"search_notes"));
    assert!(names.contains(&"reindex"));
    assert!(names.contains(&"get_note_metadata"));
    assert!(names.contains(&"list_vaults"));
}

#[test]
fn tool_definitions_have_valid_schemas() {
    let mut router = McpRouter::new();
    let req = make_request("tools/list", None, 1);
    let resp = router.handle_request(&req).unwrap();
    let result = resp.result.unwrap();
    let tools = result["tools"].as_array().unwrap();
    for tool in tools {
        assert!(!tool["description"].as_str().unwrap().is_empty());
        assert_eq!(tool["inputSchema"]["type"], "object");
        let required = &tool["inputSchema"]["required"];
        assert!(
            required.is_array() || required.is_null(),
            "required should be array or absent for {}",
            tool["name"]
        );
    }
}

#[test]
fn tools_call_without_app_returns_no_context_error() {
    let mut router = McpRouter::new();
    let req = make_request(
        "tools/call",
        Some(json!({ "name": "list_notes", "arguments": { "vault_id": "test" } })),
        1,
    );
    let resp = router.handle_request(&req).unwrap();
    assert!(resp.error.is_none());
    let result = resp.result.unwrap();
    assert!(result["is_error"].as_bool().unwrap());
    let text = result["content"][0]["text"].as_str().unwrap();
    assert!(text.contains("No app context"));
}

#[test]
fn tools_call_unknown_tool_returns_error_result() {
    let mut router = McpRouter::new();
    let req = make_request("tools/call", Some(json!({ "name": "nonexistent_tool" })), 1);
    let resp = router.handle_request(&req).unwrap();
    assert!(resp.error.is_none());
    let result = resp.result.unwrap();
    assert!(result["is_error"].as_bool().unwrap());
}

#[test]
fn tools_call_without_params_returns_error() {
    let mut router = McpRouter::new();
    let req = make_request("tools/call", None, 1);
    let resp = router.handle_request(&req).unwrap();
    assert_eq!(resp.error.as_ref().unwrap().code, INVALID_PARAMS);
}

#[test]
fn resources_list_returns_empty() {
    let mut router = McpRouter::new();
    let req = make_request("resources/list", None, 1);
    let resp = router.handle_request(&req).unwrap();
    assert!(resp.error.is_none());
    let result = resp.result.unwrap();
    assert_eq!(result["resources"], json!([]));
}

#[test]
fn invalid_jsonrpc_version_returns_error() {
    let mut router = McpRouter::new();
    let req = JsonRpcRequest {
        jsonrpc: "1.0".into(),
        method: "ping".into(),
        params: None,
        id: Some(JsonRpcId::Number(1)),
    };
    let resp = router.handle_request(&req).unwrap();
    assert_eq!(resp.error.as_ref().unwrap().code, INVALID_REQUEST);
}

#[test]
fn response_id_matches_request_id() {
    let mut router = McpRouter::new();
    let req = make_request("ping", None, 42);
    let resp = router.handle_request(&req).unwrap();
    assert_eq!(resp.id, Some(JsonRpcId::Number(42)));
}
