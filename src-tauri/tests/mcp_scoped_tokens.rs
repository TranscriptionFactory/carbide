use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::middleware::{self, Next};
use axum::response::IntoResponse;
use axum::routing::post;
use axum::{Extension, Json, Router};
use std::sync::Arc;
use tower::ServiceExt;

use crate::features::ai::agent_stream::ToolSelector;
use crate::features::mcp::auth::ScopedTokenTable;
use crate::features::mcp::http::{handle_scoped_request, resolve_request_selector};
use crate::features::mcp::router::McpRouter;
use crate::features::mcp::types::JsonRpcRequest;

const GLOBAL_TOKEN: &str = "global-secret";
const MUTATING_TOOL: &str = "create_note";
const READ_TOOL: &str = "search_notes";

struct TestState {
    token: String,
    scoped_tokens: Arc<ScopedTokenTable>,
}

async fn scoped_auth_middleware(
    State(state): State<Arc<TestState>>,
    mut request: Request,
    next: Next,
) -> axum::response::Response {
    let token = request
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::to_owned);

    match resolve_request_selector(token.as_deref(), &state.token, &state.scoped_tokens) {
        Some(selector) => {
            request.extensions_mut().insert(selector);
            next.run(request).await
        }
        None => (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error": "Unauthorized"})),
        )
            .into_response(),
    }
}

/// Mirrors `mcp_post_handler` without an `AppHandle`: auth and selector
/// enforcement are the production functions, only tool dispatch is app-less.
async fn mcp_post_handler_no_app(
    Extension(selector): Extension<ToolSelector>,
    body: String,
) -> impl IntoResponse {
    let request: JsonRpcRequest = serde_json::from_str(&body).expect("test sends valid JSON-RPC");
    let mut router = McpRouter::new();

    match handle_scoped_request(&mut router, &request, &selector) {
        None => StatusCode::NO_CONTENT.into_response(),
        Some(response) => (StatusCode::OK, Json(response)).into_response(),
    }
}

fn test_router(scoped_tokens: Arc<ScopedTokenTable>) -> Router {
    let state = Arc::new(TestState {
        token: GLOBAL_TOKEN.into(),
        scoped_tokens,
    });

    Router::new()
        .route("/mcp", post(mcp_post_handler_no_app))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            scoped_auth_middleware,
        ))
        .with_state(state)
}

async fn post_mcp(scoped_tokens: Arc<ScopedTokenTable>, token: &str, body: &str) -> (StatusCode, serde_json::Value) {
    let router = test_router(scoped_tokens);
    let request = Request::builder()
        .method("POST")
        .uri("/mcp")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::from(body.to_string()))
        .unwrap();

    let response = ServiceExt::<Request<Body>>::oneshot(router, request)
        .await
        .unwrap();
    let status = response.status();

    if status == StatusCode::UNAUTHORIZED {
        return (status, serde_json::Value::Null);
    }

    let bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024)
        .await
        .unwrap();
    (status, serde_json::from_slice(&bytes).unwrap())
}

fn tools_list_body() -> &'static str {
    r#"{"jsonrpc":"2.0","method":"tools/list","id":1}"#
}

fn tools_call_body(name: &str) -> String {
    format!(
        r#"{{"jsonrpc":"2.0","method":"tools/call","params":{{"name":"{}","arguments":{{}}}},"id":2}}"#,
        name
    )
}

fn tool_names(json: &serde_json::Value) -> Vec<String> {
    json["result"]["tools"]
        .as_array()
        .expect("tools/list returns an array")
        .iter()
        .map(|tool| tool["name"].as_str().unwrap().to_string())
        .collect()
}

fn result_text(json: &serde_json::Value) -> String {
    json["result"]["content"][0]["text"]
        .as_str()
        .expect("tool result carries a text block")
        .to_string()
}

fn is_safe_mode_refusal(json: &serde_json::Value) -> bool {
    json["result"]["is_error"] == true && result_text(json).contains("blocked by safe mode")
}

#[tokio::test]
async fn global_token_keeps_full_tool_access() {
    let table = Arc::new(ScopedTokenTable::default());

    let (status, json) = post_mcp(table.clone(), GLOBAL_TOKEN, tools_list_body()).await;
    assert_eq!(status, StatusCode::OK);
    let names = tool_names(&json);
    assert!(names.iter().any(|n| n == MUTATING_TOOL));
    assert!(names.iter().any(|n| n == READ_TOOL));

    let (status, json) = post_mcp(table, GLOBAL_TOKEN, &tools_call_body(MUTATING_TOOL)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(!is_safe_mode_refusal(&json));
}

#[tokio::test]
async fn read_only_token_omits_mutating_tools_from_list() {
    let table = Arc::new(ScopedTokenTable::default());
    let token = table.mint_scoped_token(ToolSelector::ReadOnly);

    let (status, json) = post_mcp(table, &token, tools_list_body()).await;
    assert_eq!(status, StatusCode::OK);

    let names = tool_names(&json);
    assert!(!names.is_empty());
    assert!(names.iter().any(|n| n == READ_TOOL));
    assert!(
        !names.iter().any(|n| n == MUTATING_TOOL),
        "read-only session must not see {}: {:?}",
        MUTATING_TOOL,
        names
    );
}

#[tokio::test]
async fn read_only_token_refuses_mutating_call() {
    let table = Arc::new(ScopedTokenTable::default());
    let token = table.mint_scoped_token(ToolSelector::ReadOnly);

    let (status, json) = post_mcp(table, &token, &tools_call_body(MUTATING_TOOL)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["result"]["is_error"], true);

    let text = result_text(&json);
    assert!(text.contains(MUTATING_TOOL), "refusal must name the tool: {text}");
    assert!(text.contains("blocked by safe mode"), "refusal must cite safe mode: {text}");
}

#[tokio::test]
async fn read_only_token_admits_read_call() {
    let table = Arc::new(ScopedTokenTable::default());
    let token = table.mint_scoped_token(ToolSelector::ReadOnly);

    let (status, json) = post_mcp(table, &token, &tools_call_body(READ_TOOL)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        !is_safe_mode_refusal(&json),
        "read tool must clear the selector and reach dispatch: {}",
        result_text(&json)
    );
}

#[tokio::test]
async fn scoped_selector_leaves_unknown_tools_to_the_router() {
    let table = Arc::new(ScopedTokenTable::default());
    let token = table.mint_scoped_token(ToolSelector::ReadOnly);

    let (_, json) = post_mcp(table, &token, &tools_call_body("no_such_tool")).await;
    assert!(!is_safe_mode_refusal(&json));
}

#[tokio::test]
async fn only_selector_honors_named_tools() {
    let table = Arc::new(ScopedTokenTable::default());
    let token = table.mint_scoped_token(ToolSelector::Only {
        names: vec![MUTATING_TOOL.into()],
    });

    let (_, json) = post_mcp(table.clone(), &token, tools_list_body()).await;
    assert_eq!(tool_names(&json), vec![MUTATING_TOOL.to_string()]);

    let (_, json) = post_mcp(table.clone(), &token, &tools_call_body(MUTATING_TOOL)).await;
    assert!(!is_safe_mode_refusal(&json));

    let (_, json) = post_mcp(table, &token, &tools_call_body(READ_TOOL)).await;
    assert!(is_safe_mode_refusal(&json));
    assert!(result_text(&json).contains(READ_TOOL));
}

#[tokio::test]
async fn unknown_token_is_rejected() {
    let table = Arc::new(ScopedTokenTable::default());

    let (status, _) = post_mcp(table, "not-a-token", tools_list_body()).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn revoked_token_is_rejected() {
    let table = Arc::new(ScopedTokenTable::default());
    let token = table.mint_scoped_token(ToolSelector::ReadOnly);

    let (status, _) = post_mcp(table.clone(), &token, tools_list_body()).await;
    assert_eq!(status, StatusCode::OK);

    table.revoke(&token);

    let (status, _) = post_mcp(table, &token, tools_list_body()).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[test]
fn minted_tokens_are_unique_hex() {
    let table = ScopedTokenTable::default();

    let first = table.mint_scoped_token(ToolSelector::ReadOnly);
    let second = table.mint_scoped_token(ToolSelector::Full);

    assert_ne!(first, second);
    assert_eq!(first.len(), 64);
    assert!(first.chars().all(|c| c.is_ascii_hexdigit()));
    assert_eq!(table.lookup(&second), Some(ToolSelector::Full));
    assert_eq!(table.lookup("absent"), None);
}
