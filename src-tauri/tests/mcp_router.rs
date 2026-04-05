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
            "protocol_version": "2024-11-05",
            "capabilities": {},
            "client_info": { "name": "test-client", "version": "1.0" }
        })),
        1,
    );
    let resp = router.handle_request(&req).unwrap();
    assert!(resp.error.is_none());
    let result = resp.result.unwrap();
    assert_eq!(result["protocol_version"], "2024-11-05");
    assert_eq!(result["server_info"]["name"], "carbide");
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
fn tools_list_returns_empty_for_now() {
    let mut router = McpRouter::new();
    let req = make_request("tools/list", None, 1);
    let resp = router.handle_request(&req).unwrap();
    assert!(resp.error.is_none());
    let result = resp.result.unwrap();
    assert_eq!(result["tools"], json!([]));
}

#[test]
fn tools_call_unknown_tool_returns_error_result() {
    let mut router = McpRouter::new();
    let req = make_request(
        "tools/call",
        Some(json!({ "name": "nonexistent_tool" })),
        1,
    );
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
