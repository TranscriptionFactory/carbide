use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::features::mcp::http::{check_auth, HttpAppState};
use crate::features::notes::service::{self as notes_service, safe_vault_abs};
use crate::features::search::db as search_db;
use crate::features::search::model::SearchScope;
use crate::features::search::service::with_read_conn;
use crate::features::vault::service as vault_service;
use crate::shared::storage;

#[derive(Deserialize)]
struct ReadParams {
    vault_id: String,
    path: String,
}

#[derive(Serialize)]
struct ReadResponse {
    path: String,
    content: String,
}

#[derive(Deserialize)]
struct SearchParams {
    vault_id: String,
    query: String,
    #[serde(default = "default_search_limit")]
    limit: usize,
}

fn default_search_limit() -> usize {
    50
}

#[derive(Deserialize)]
struct FilesParams {
    vault_id: String,
    folder: Option<String>,
}

#[derive(Deserialize)]
struct VaultIdParams {
    vault_id: String,
}

#[derive(Deserialize)]
struct NotePathParams {
    vault_id: String,
    path: String,
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

fn internal_err(msg: String) -> axum::response::Response {
    json_err(StatusCode::INTERNAL_SERVER_ERROR, msg)
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
}

async fn cli_read(
    State(state): State<Arc<HttpAppState>>,
    headers: HeaderMap,
    Json(params): Json<ReadParams>,
) -> axum::response::Response {
    if let Err(status) = check_auth(&headers, state.token()) {
        return json_err(status, "Unauthorized");
    }

    let root = match storage::vault_path(state.app(), &params.vault_id) {
        Ok(r) => r,
        Err(e) => return internal_err(e),
    };

    let abs = match safe_vault_abs(&root, &params.path) {
        Ok(a) => a,
        Err(e) => return json_err(StatusCode::BAD_REQUEST, e),
    };

    match std::fs::read_to_string(&abs) {
        Ok(content) => (StatusCode::OK, Json(ReadResponse {
            path: params.path,
            content,
        })).into_response(),
        Err(e) => json_err(StatusCode::NOT_FOUND, format!("Failed to read note: {}", e)),
    }
}

async fn cli_search(
    State(state): State<Arc<HttpAppState>>,
    headers: HeaderMap,
    Json(params): Json<SearchParams>,
) -> axum::response::Response {
    if let Err(status) = check_auth(&headers, state.token()) {
        return json_err(status, "Unauthorized");
    }

    let limit = params.limit.min(200);
    match with_read_conn(state.app(), &params.vault_id, |conn| {
        search_db::search(conn, &params.query, SearchScope::All, limit)
    }) {
        Ok(hits) => (StatusCode::OK, Json(hits)).into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_files(
    State(state): State<Arc<HttpAppState>>,
    headers: HeaderMap,
    Json(params): Json<FilesParams>,
) -> axum::response::Response {
    if let Err(status) = check_auth(&headers, state.token()) {
        return json_err(status, "Unauthorized");
    }

    match notes_service::list_notes(state.app().clone(), params.vault_id) {
        Ok(mut notes) => {
            if let Some(ref folder) = params.folder {
                let prefix = if folder.ends_with('/') {
                    folder.clone()
                } else {
                    format!("{}/", folder)
                };
                notes.retain(|n| n.path.starts_with(&prefix));
            }
            (StatusCode::OK, Json(notes)).into_response()
        }
        Err(e) => internal_err(e),
    }
}

async fn cli_tags(
    State(state): State<Arc<HttpAppState>>,
    headers: HeaderMap,
    Json(params): Json<VaultIdParams>,
) -> axum::response::Response {
    if let Err(status) = check_auth(&headers, state.token()) {
        return json_err(status, "Unauthorized");
    }

    match with_read_conn(state.app(), &params.vault_id, |conn| {
        search_db::list_all_tags(conn)
    }) {
        Ok(tags) => (StatusCode::OK, Json(tags)).into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_properties(
    State(state): State<Arc<HttpAppState>>,
    headers: HeaderMap,
    Json(params): Json<VaultIdParams>,
) -> axum::response::Response {
    if let Err(status) = check_auth(&headers, state.token()) {
        return json_err(status, "Unauthorized");
    }

    match with_read_conn(state.app(), &params.vault_id, |conn| {
        search_db::list_all_properties(conn)
    }) {
        Ok(props) => (StatusCode::OK, Json(props)).into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_outline(
    State(state): State<Arc<HttpAppState>>,
    headers: HeaderMap,
    Json(params): Json<NotePathParams>,
) -> axum::response::Response {
    if let Err(status) = check_auth(&headers, state.token()) {
        return json_err(status, "Unauthorized");
    }

    match with_read_conn(state.app(), &params.vault_id, |conn| {
        search_db::get_note_headings(conn, &params.path)
    }) {
        Ok(headings) => (StatusCode::OK, Json(headings)).into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_vault(
    State(state): State<Arc<HttpAppState>>,
    headers: HeaderMap,
    Json(params): Json<VaultIdParams>,
) -> axum::response::Response {
    if let Err(status) = check_auth(&headers, state.token()) {
        return json_err(status, "Unauthorized");
    }

    match vault_service::list_vaults(state.app().clone()) {
        Ok(vaults) => {
            match vaults.into_iter().find(|v| v.id == params.vault_id) {
                Some(vault) => (StatusCode::OK, Json(vault)).into_response(),
                None => json_err(StatusCode::NOT_FOUND, "Vault not found"),
            }
        }
        Err(e) => internal_err(e),
    }
}

async fn cli_vaults(
    State(state): State<Arc<HttpAppState>>,
    headers: HeaderMap,
) -> axum::response::Response {
    if let Err(status) = check_auth(&headers, state.token()) {
        return json_err(status, "Unauthorized");
    }

    match vault_service::list_vaults(state.app().clone()) {
        Ok(vaults) => (StatusCode::OK, Json(vaults)).into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_status(
    State(state): State<Arc<HttpAppState>>,
    headers: HeaderMap,
) -> axum::response::Response {
    if let Err(status) = check_auth(&headers, state.token()) {
        return json_err(status, "Unauthorized");
    }

    let active_vault_id = vault_service::get_last_vault_id(state.app().clone())
        .unwrap_or(None);

    (StatusCode::OK, Json(StatusResponse {
        running: true,
        version: env!("CARGO_PKG_VERSION"),
        active_vault_id,
    })).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    async fn cli_handler_status_no_app(
        State(token): State<Arc<String>>,
        headers: HeaderMap,
    ) -> axum::response::Response {
        if let Err(status) = check_auth(&headers, &token) {
            return json_err(status, "Unauthorized");
        }
        (StatusCode::OK, Json(StatusResponse {
            running: true,
            version: env!("CARGO_PKG_VERSION"),
            active_vault_id: None,
        })).into_response()
    }

    fn test_status_router(token: &str) -> Router {
        Router::new()
            .route("/cli/status", post(cli_handler_status_no_app))
            .with_state(Arc::new(token.to_string()))
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
        let resp = ServiceExt::<Request<Body>>::oneshot(router, req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let json = response_json(resp).await;
        assert_eq!(json["running"], true);
        assert!(json["version"].is_string());
    }

    #[tokio::test]
    async fn test_cli_status_auth_rejected() {
        let router = test_status_router("secret");
        let req = post_json("/cli/status", "wrong", "{}");
        let resp = ServiceExt::<Request<Body>>::oneshot(router, req).await.unwrap();
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
        let resp = ServiceExt::<Request<Body>>::oneshot(router, req).await.unwrap();
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
    fn test_default_search_limit() {
        assert_eq!(default_search_limit(), 50);
    }
}
