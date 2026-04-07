use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::post;
use axum::{Json, Router};
use serde::Serialize;
use std::sync::Arc;

use crate::features::mcp::http::HttpAppState;
use crate::features::mcp::shared_ops::{
    self, CreateNoteArgs as SharedCreateArgs, CreateResult, OpError,
};

#[derive(Serialize)]
struct ReadResponse {
    path: String,
    content: String,
}

#[derive(Serialize)]
struct StatusResponse {
    running: bool,
    version: &'static str,
    active_vault_id: Option<String>,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn json_err(status: StatusCode, msg: impl Into<String>) -> axum::response::Response {
    (status, Json(ErrorResponse { error: msg.into() })).into_response()
}

#[derive(Serialize)]
struct MutationResponse {
    ok: bool,
    path: String,
}

fn op_err_to_response(e: OpError) -> axum::response::Response {
    match e {
        OpError::NotFound(m) => json_err(StatusCode::NOT_FOUND, m),
        OpError::BadRequest(m) => json_err(StatusCode::BAD_REQUEST, m),
        OpError::Conflict(m) => json_err(StatusCode::CONFLICT, m),
        OpError::Internal(m) => json_err(StatusCode::INTERNAL_SERVER_ERROR, m),
    }
}

fn mutation_ok(path: String) -> axum::response::Response {
    (StatusCode::OK, Json(MutationResponse { ok: true, path })).into_response()
}

pub fn cli_router() -> Router<Arc<HttpAppState>> {
    Router::new()
        .route("/read", post(cli_read))
        .route("/search", post(cli_search))
        .route("/files", post(cli_files))
        .route("/tags", post(cli_tags))
        .route("/properties", post(cli_properties))
        .route("/outline", post(cli_outline))
        .route("/vault", post(cli_vault))
        .route("/vaults", post(cli_vaults))
        .route("/status", post(cli_status))
        .route("/create", post(cli_create))
        .route("/write", post(cli_write))
        .route("/append", post(cli_append))
        .route("/prepend", post(cli_prepend))
        .route("/rename", post(cli_rename))
        .route("/move", post(cli_move))
        .route("/delete", post(cli_delete))
}

async fn cli_read(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::VaultPathArgs>,
) -> axum::response::Response {
    match shared_ops::read_note(state.app(), &params.vault_id, &params.path) {
        Ok((path, content)) => {
            (StatusCode::OK, Json(ReadResponse { path, content })).into_response()
        }
        Err(e) => op_err_to_response(e),
    }
}

async fn cli_search(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::SearchArgs>,
) -> axum::response::Response {
    let limit = params.limit.unwrap_or(50).min(200);
    match shared_ops::search_notes_db(state.app(), &params.vault_id, &params.query, limit) {
        Ok(hits) => (StatusCode::OK, Json(hits)).into_response(),
        Err(e) => op_err_to_response(e),
    }
}

async fn cli_files(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::ListNotesArgs>,
) -> axum::response::Response {
    match shared_ops::list_notes(state.app(), &params.vault_id, params.folder.as_deref()) {
        Ok(notes) => (StatusCode::OK, Json(notes)).into_response(),
        Err(e) => op_err_to_response(e),
    }
}

async fn cli_tags(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::VaultIdArgs>,
) -> axum::response::Response {
    match shared_ops::note_tags(state.app(), &params.vault_id) {
        Ok(tags) => (StatusCode::OK, Json(tags)).into_response(),
        Err(e) => op_err_to_response(e),
    }
}

async fn cli_properties(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::VaultIdArgs>,
) -> axum::response::Response {
    match shared_ops::note_properties(state.app(), &params.vault_id) {
        Ok(props) => (StatusCode::OK, Json(props)).into_response(),
        Err(e) => op_err_to_response(e),
    }
}

async fn cli_outline(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::VaultPathArgs>,
) -> axum::response::Response {
    match shared_ops::note_outline(state.app(), &params.vault_id, &params.path) {
        Ok(headings) => (StatusCode::OK, Json(headings)).into_response(),
        Err(e) => op_err_to_response(e),
    }
}

async fn cli_vault(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::VaultIdArgs>,
) -> axum::response::Response {
    match shared_ops::get_vault(state.app(), &params.vault_id) {
        Ok(vault) => (StatusCode::OK, Json(vault)).into_response(),
        Err(e) => op_err_to_response(e),
    }
}

async fn cli_vaults(State(state): State<Arc<HttpAppState>>) -> axum::response::Response {
    match shared_ops::list_vaults(state.app()) {
        Ok(vaults) => (StatusCode::OK, Json(vaults)).into_response(),
        Err(e) => op_err_to_response(e),
    }
}

async fn cli_status(State(state): State<Arc<HttpAppState>>) -> axum::response::Response {
    let active_vault_id = shared_ops::get_active_vault_id(state.app()).unwrap_or(None);

    (
        StatusCode::OK,
        Json(StatusResponse {
            running: true,
            version: env!("CARGO_PKG_VERSION"),
            active_vault_id,
        }),
    )
        .into_response()
}

async fn cli_create(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<SharedCreateArgs>,
) -> axum::response::Response {
    match shared_ops::create_note(state.app(), &params) {
        Ok(CreateResult::Created(meta)) => (StatusCode::CREATED, Json(meta)).into_response(),
        Ok(CreateResult::Overwritten(path)) => mutation_ok(path),
        Err(e) => op_err_to_response(e),
    }
}

async fn cli_write(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::WriteNoteArgs>,
) -> axum::response::Response {
    match shared_ops::write_note(state.app(), &params.vault_id, &params.path, &params.content) {
        Ok(path) => mutation_ok(path),
        Err(e) => op_err_to_response(e),
    }
}

async fn cli_append(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::WriteNoteArgs>,
) -> axum::response::Response {
    match shared_ops::append_to_note(state.app(), &params.vault_id, &params.path, &params.content) {
        Ok(path) => mutation_ok(path),
        Err(e) => op_err_to_response(e),
    }
}

async fn cli_prepend(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::WriteNoteArgs>,
) -> axum::response::Response {
    match shared_ops::prepend_to_note(state.app(), &params.vault_id, &params.path, &params.content)
    {
        Ok(path) => mutation_ok(path),
        Err(e) => op_err_to_response(e),
    }
}

async fn cli_rename(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::RenameArgs>,
) -> axum::response::Response {
    match shared_ops::rename_note(
        state.app(),
        &params.vault_id,
        &params.path,
        &params.new_path,
    ) {
        Ok(path) => mutation_ok(path),
        Err(e) => op_err_to_response(e),
    }
}

async fn cli_move(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::MoveArgs>,
) -> axum::response::Response {
    match shared_ops::move_note(state.app(), &params.vault_id, &params.path, &params.to) {
        Ok(path) => mutation_ok(path),
        Err(e) => op_err_to_response(e),
    }
}

async fn cli_delete(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::VaultPathArgs>,
) -> axum::response::Response {
    match shared_ops::delete_note(state.app(), &params.vault_id, &params.path) {
        Ok(()) => mutation_ok(params.path),
        Err(e) => op_err_to_response(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use axum::middleware;
    use tower::ServiceExt;

    use crate::features::mcp::auth;
    use crate::features::mcp::shared_ops::CreateNoteArgs;

    async fn test_auth_middleware(
        State(token): State<Arc<String>>,
        request: axum::extract::Request,
        next: axum::middleware::Next,
    ) -> axum::response::Response {
        let provided = request
            .headers()
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "));

        match provided {
            Some(t) if auth::verify_token(t, &token) => next.run(request).await,
            _ => json_err(StatusCode::UNAUTHORIZED, "Unauthorized"),
        }
    }

    async fn cli_handler_status_no_app() -> axum::response::Response {
        (
            StatusCode::OK,
            Json(StatusResponse {
                running: true,
                version: env!("CARGO_PKG_VERSION"),
                active_vault_id: None,
            }),
        )
            .into_response()
    }

    fn test_status_router(token: &str) -> Router {
        let state = Arc::new(token.to_string());
        Router::new()
            .route("/cli/status", post(cli_handler_status_no_app))
            .layer(middleware::from_fn_with_state(
                state.clone(),
                test_auth_middleware,
            ))
            .with_state(state)
    }

    fn post_json(uri: &str, token: &str, body: &str) -> Request<Body> {
        Request::builder()
            .method("POST")
            .uri(uri)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", token))
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    async fn response_json(resp: axum::response::Response) -> serde_json::Value {
        let body = axum::body::to_bytes(resp.into_body(), 16384).await.unwrap();
        serde_json::from_slice(&body).unwrap()
    }

    #[tokio::test]
    async fn test_cli_status_returns_running() {
        let router = test_status_router("secret");
        let req = post_json("/cli/status", "secret", "{}");
        let resp = ServiceExt::<Request<Body>>::oneshot(router, req)
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let json = response_json(resp).await;
        assert_eq!(json["running"], true);
        assert!(json["version"].is_string());
    }

    #[tokio::test]
    async fn test_cli_status_auth_rejected() {
        let router = test_status_router("secret");
        let req = post_json("/cli/status", "wrong", "{}");
        let resp = ServiceExt::<Request<Body>>::oneshot(router, req)
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_cli_status_no_auth_header() {
        let router = test_status_router("secret");
        let req = Request::builder()
            .method("POST")
            .uri("/cli/status")
            .header("Content-Type", "application/json")
            .body(Body::from("{}"))
            .unwrap();
        let resp = ServiceExt::<Request<Body>>::oneshot(router, req)
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn test_read_response_serialization() {
        let resp = ReadResponse {
            path: "test.md".into(),
            content: "# Hello".into(),
        };
        let json = serde_json::to_value(resp).unwrap();
        assert_eq!(json["path"], "test.md");
        assert_eq!(json["content"], "# Hello");
    }

    #[test]
    fn test_status_response_serialization() {
        let resp = StatusResponse {
            running: true,
            version: "1.0.0",
            active_vault_id: Some("abc".into()),
        };
        let json = serde_json::to_value(resp).unwrap();
        assert_eq!(json["running"], true);
        assert_eq!(json["version"], "1.0.0");
        assert_eq!(json["active_vault_id"], "abc");
    }

    #[test]
    fn test_status_response_no_vault() {
        let resp = StatusResponse {
            running: true,
            version: "1.0.0",
            active_vault_id: None,
        };
        let json = serde_json::to_value(resp).unwrap();
        assert!(json["active_vault_id"].is_null());
    }

    #[test]
    fn test_error_response_serialization() {
        let resp = ErrorResponse {
            error: "something broke".into(),
        };
        let json = serde_json::to_value(resp).unwrap();
        assert_eq!(json["error"], "something broke");
    }

    #[test]
    fn test_create_args_deserialization() {
        let json = r##"{"vault_id":"v1","path":"new.md","content":"# Hello","overwrite":false}"##;
        let params: CreateNoteArgs = serde_json::from_str(json).unwrap();
        assert_eq!(params.vault_id, "v1");
        assert_eq!(params.path, "new.md");
        assert_eq!(params.content, "# Hello");
        assert!(!params.overwrite);
    }

    #[test]
    fn test_create_args_defaults() {
        let json = r#"{"vault_id":"v1","path":"new.md"}"#;
        let params: CreateNoteArgs = serde_json::from_str(json).unwrap();
        assert_eq!(params.content, "");
        assert!(!params.overwrite);
    }

    #[test]
    fn test_write_args_deserialization() {
        let json = r#"{"vault_id":"v1","path":"note.md","content":"updated"}"#;
        let params: shared_ops::WriteNoteArgs = serde_json::from_str(json).unwrap();
        assert_eq!(params.path, "note.md");
        assert_eq!(params.content, "updated");
    }

    #[test]
    fn test_rename_args_deserialization() {
        let json = r#"{"vault_id":"v1","path":"old.md","new_path":"new.md"}"#;
        let params: shared_ops::RenameArgs = serde_json::from_str(json).unwrap();
        assert_eq!(params.path, "old.md");
        assert_eq!(params.new_path, "new.md");
    }

    #[test]
    fn test_move_args_deserialization() {
        let json = r#"{"vault_id":"v1","path":"note.md","to":"archive/"}"#;
        let params: shared_ops::MoveArgs = serde_json::from_str(json).unwrap();
        assert_eq!(params.path, "note.md");
        assert_eq!(params.to, "archive/");
    }

    #[test]
    fn test_delete_args_deserialization() {
        let json = r#"{"vault_id":"v1","path":"trash.md"}"#;
        let params: shared_ops::VaultPathArgs = serde_json::from_str(json).unwrap();
        assert_eq!(params.path, "trash.md");
    }

    #[test]
    fn test_mutation_response_serialization() {
        let resp = MutationResponse {
            ok: true,
            path: "note.md".into(),
        };
        let json = serde_json::to_value(resp).unwrap();
        assert_eq!(json["ok"], true);
        assert_eq!(json["path"], "note.md");
    }
}
