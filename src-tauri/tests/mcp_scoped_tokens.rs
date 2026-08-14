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
use crate::features::ai::permissions::SessionPolicy;
use crate::features::mcp::auth::{ScopedTokenTable, TokenScope};
use crate::features::mcp::http::{handle_scoped_request, resolve_request_scope};
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

    match resolve_request_scope(token.as_deref(), &state.token, &state.scoped_tokens) {
        Some(scope) => {
            request.extensions_mut().insert(scope);
            next.run(request).await
        }
        None => (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error": "Unauthorized"})),
        )
            .into_response(),
    }
}

/// Mirrors `mcp_post_handler` without an `AppHandle`: auth and scope
/// enforcement are the production functions, only tool dispatch is app-less.
async fn mcp_post_handler_no_app(
    Extension(scope): Extension<TokenScope>,
    body: String,
) -> impl IntoResponse {
    let request: JsonRpcRequest = serde_json::from_str(&body).expect("test sends valid JSON-RPC");
    let mut router = McpRouter::new();

    match handle_scoped_request(&mut router, &request, &scope) {
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

/// The shape every chat session mints: the whole catalog is advertised, and
/// the policy alone decides whether a mutation goes through.
fn chat_session(table: &ScopedTokenTable) -> (String, Arc<SessionPolicy>) {
    let policy = Arc::new(SessionPolicy::default());
    let token = table.mint_scoped_token(ToolSelector::Full, policy.clone());
    (token, policy)
}

async fn post_mcp(
    scoped_tokens: Arc<ScopedTokenTable>,
    token: &str,
    body: &str,
) -> (StatusCode, serde_json::Value) {
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

fn is_refusal(json: &serde_json::Value) -> bool {
    json["result"]["is_error"] == true
        && (result_text(json).contains("auto-approve is off")
            || result_text(json).contains("not available on this surface"))
}

// S17: terminal handoff and the CLI run under the user's own hands.
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
    assert!(!is_refusal(&json));
}

// S7, first half — and the reason the toggle can be live at all. A catalog
// fetched once at session start could never widen on a mid-conversation flip,
// so consent must not narrow it.
#[tokio::test]
async fn auto_approve_off_still_advertises_every_mutating_tool() {
    let table = Arc::new(ScopedTokenTable::default());
    let (token, policy) = chat_session(&table);
    assert!(!policy.auto_approve());

    let (status, json) = post_mcp(table, &token, tools_list_body()).await;
    assert_eq!(status, StatusCode::OK);

    let names = tool_names(&json);
    assert!(
        names.iter().any(|n| n == MUTATING_TOOL),
        "a blocked tool must still be visible so the model can report it: {names:?}"
    );
    assert!(names.iter().any(|n| n == READ_TOOL));
}

// S7, second half.
#[tokio::test]
async fn auto_approve_off_refuses_a_mutating_call_with_actionable_copy() {
    let table = Arc::new(ScopedTokenTable::default());
    let (token, _policy) = chat_session(&table);

    let (status, json) = post_mcp(table, &token, &tools_call_body(MUTATING_TOOL)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["result"]["is_error"], true);

    let text = result_text(&json);
    assert!(text.contains(MUTATING_TOOL), "refusal must name the tool: {text}");
    assert!(
        text.contains("Auto-approve"),
        "refusal must tell the model what would unblock it: {text}"
    );
}

#[tokio::test]
async fn auto_approve_off_admits_a_read_call() {
    let table = Arc::new(ScopedTokenTable::default());
    let (token, _policy) = chat_session(&table);

    let (status, json) = post_mcp(table, &token, &tools_call_body(READ_TOOL)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        !is_refusal(&json),
        "a read tool is never gated on consent: {}",
        result_text(&json)
    );
}

// S12 at the HTTP layer: the same token, minted once, answers differently
// either side of a flip.
#[tokio::test]
async fn flipping_auto_approve_on_unblocks_the_same_token() {
    let table = Arc::new(ScopedTokenTable::default());
    let (token, policy) = chat_session(&table);

    let (_, json) = post_mcp(table.clone(), &token, &tools_call_body(MUTATING_TOOL)).await;
    assert!(is_refusal(&json));

    policy.set_auto_approve(true);

    let (_, json) = post_mcp(table.clone(), &token, &tools_call_body(MUTATING_TOOL)).await;
    assert!(!is_refusal(&json));

    policy.set_auto_approve(false);

    let (_, json) = post_mcp(table, &token, &tools_call_body(MUTATING_TOOL)).await;
    assert!(is_refusal(&json));
}

// S16 (O1): approving the harness's permission prompt must not be followed by
// a refusal here — that is the same mislabelling this change removes.
#[tokio::test]
async fn a_ticket_lets_exactly_one_approved_mutating_call_through() {
    let table = Arc::new(ScopedTokenTable::default());
    let (token, policy) = chat_session(&table);

    policy.grant_ticket(MUTATING_TOOL);

    let (_, json) = post_mcp(table.clone(), &token, &tools_call_body(MUTATING_TOOL)).await;
    assert!(
        !is_refusal(&json),
        "the user already approved this call: {}",
        result_text(&json)
    );

    let (_, json) = post_mcp(table, &token, &tools_call_body(MUTATING_TOOL)).await;
    assert!(
        is_refusal(&json),
        "one approval buys one call, not a standing grant"
    );
}

#[tokio::test]
async fn a_ticket_for_one_tool_does_not_unblock_another() {
    let table = Arc::new(ScopedTokenTable::default());
    let (token, policy) = chat_session(&table);

    policy.grant_ticket("delete_note");

    let (_, json) = post_mcp(table, &token, &tools_call_body(MUTATING_TOOL)).await;
    assert!(is_refusal(&json));
}

#[tokio::test]
async fn scoped_session_leaves_unknown_tools_to_the_router() {
    let table = Arc::new(ScopedTokenTable::default());
    let (token, _policy) = chat_session(&table);

    let (_, json) = post_mcp(table, &token, &tools_call_body("no_such_tool")).await;
    assert!(!is_refusal(&json));
}

// S11: inline edit's narrowed scope is a surface contract, not consent, so the
// toggle does not touch it either way.
#[tokio::test]
async fn only_selector_honors_named_tools_regardless_of_consent() {
    let table = Arc::new(ScopedTokenTable::default());
    let policy = Arc::new(SessionPolicy::default());
    let token = table.mint_scoped_token(
        ToolSelector::Only {
            names: vec![READ_TOOL.into()],
        },
        policy.clone(),
    );

    for auto_approve in [false, true] {
        policy.set_auto_approve(auto_approve);

        let (_, json) = post_mcp(table.clone(), &token, tools_list_body()).await;
        assert_eq!(tool_names(&json), vec![READ_TOOL.to_string()]);

        let (_, json) = post_mcp(table.clone(), &token, &tools_call_body(READ_TOOL)).await;
        assert!(!is_refusal(&json));

        let (_, json) = post_mcp(table.clone(), &token, &tools_call_body(MUTATING_TOOL)).await;
        assert!(
            is_refusal(&json),
            "a tool outside the surface's scope stays out of reach with auto_approve={auto_approve}"
        );
        assert!(result_text(&json).contains(MUTATING_TOOL));
    }
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
    let (token, _policy) = chat_session(&table);

    let (status, _) = post_mcp(table.clone(), &token, tools_list_body()).await;
    assert_eq!(status, StatusCode::OK);

    table.revoke(&token);

    let (status, _) = post_mcp(table, &token, tools_list_body()).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[test]
fn minted_tokens_are_unique_hex_and_carry_their_own_policy() {
    let table = ScopedTokenTable::default();

    let first_policy = Arc::new(SessionPolicy::default());
    let second_policy = Arc::new(SessionPolicy::default());
    let first = table.mint_scoped_token(ToolSelector::Full, first_policy);
    let second = table.mint_scoped_token(ToolSelector::Full, second_policy.clone());

    assert_ne!(first, second);
    assert_eq!(first.len(), 64);
    assert!(first.chars().all(|c| c.is_ascii_hexdigit()));

    second_policy.set_auto_approve(true);
    let looked_up = table.lookup(&second).expect("the token was just minted");
    assert!(matches!(looked_up.selector, ToolSelector::Full));
    assert!(
        looked_up.policy.auto_approve(),
        "the table holds the live cell, not a copy of its value"
    );
    assert!(
        !table
            .lookup(&first)
            .expect("the token was just minted")
            .policy
            .auto_approve(),
        "one session's flip must not reach another's"
    );
    assert!(table.lookup("absent").is_none());
}
