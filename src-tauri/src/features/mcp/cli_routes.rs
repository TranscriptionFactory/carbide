use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::features::mcp::http::{check_auth, HttpAppState};
use crate::features::notes::service::{
    self as notes_service, safe_vault_abs, safe_vault_abs_for_write, NoteCreateArgs,
    NoteDeleteArgs, NoteRenameArgs,
};
use crate::features::search::db as search_db;
use crate::features::search::model::SearchScope;
use crate::features::search::service::with_read_conn;
use crate::features::vault::service as vault_service;
use crate::shared::{io_utils, storage};

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

#[derive(Deserialize)]
struct CreateParams {
    vault_id: String,
    path: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    overwrite: bool,
}

#[derive(Deserialize)]
struct WriteParams {
    vault_id: String,
    path: String,
    content: String,
}

#[derive(Deserialize)]
struct AppendParams {
    vault_id: String,
    path: String,
    content: String,
}

#[derive(Deserialize)]
struct PrependParams {
    vault_id: String,
    path: String,
    content: String,
}

#[derive(Deserialize)]
struct RenameParams {
    vault_id: String,
    path: String,
    new_path: String,
}

#[derive(Deserialize)]
struct MoveParams {
    vault_id: String,
    path: String,
    to: String,
}

#[derive(Deserialize)]
struct DeleteParams {
    vault_id: String,
    path: String,
}

#[derive(Serialize)]
struct MutationResponse {
    ok: bool,
    path: String,
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

fn find_frontmatter_end(content: &str) -> Option<usize> {
    if !content.starts_with("---") {
        return None;
    }
    let after_open = &content[3..];
    let newline_pos = after_open.find('\n')?;
    let search_start = 3 + newline_pos + 1;
    let rest = &content[search_start..];
    for (i, line) in rest.lines().enumerate() {
        if line.trim() == "---" {
            let offset = if i == 0 {
                0
            } else {
                rest.match_indices('\n')
                    .nth(i - 1)
                    .map(|(pos, _)| pos + 1)
                    .unwrap_or(0)
            };
            return Some(search_start + offset + line.len() + 1);
        }
    }
    None
}

async fn cli_create(
    State(state): State<Arc<HttpAppState>>,
    headers: HeaderMap,
    Json(params): Json<CreateParams>,
) -> axum::response::Response {
    if let Err(status) = check_auth(&headers, state.token()) {
        return json_err(status, "Unauthorized");
    }

    let root = match storage::vault_path(state.app(), &params.vault_id) {
        Ok(r) => r,
        Err(e) => return internal_err(e),
    };

    let abs = match safe_vault_abs_for_write(&root, &params.path) {
        Ok(a) => a,
        Err(e) => return json_err(StatusCode::BAD_REQUEST, e),
    };

    if abs.exists() && !params.overwrite {
        return json_err(StatusCode::CONFLICT, "note already exists");
    }

    if params.overwrite && abs.exists() {
        if let Err(e) = io_utils::atomic_write(&abs, params.content.as_bytes()) {
            return internal_err(e);
        }
        return (StatusCode::OK, Json(MutationResponse {
            ok: true,
            path: params.path,
        })).into_response();
    }

    match notes_service::create_note(
        NoteCreateArgs {
            vault_id: params.vault_id,
            note_path: params.path.clone(),
            initial_markdown: params.content,
        },
        state.app().clone(),
    ) {
        Ok(meta) => (StatusCode::CREATED, Json(meta)).into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_write(
    State(state): State<Arc<HttpAppState>>,
    headers: HeaderMap,
    Json(params): Json<WriteParams>,
) -> axum::response::Response {
    if let Err(status) = check_auth(&headers, state.token()) {
        return json_err(status, "Unauthorized");
    }

    let root = match storage::vault_path(state.app(), &params.vault_id) {
        Ok(r) => r,
        Err(e) => return internal_err(e),
    };

    let abs = match safe_vault_abs_for_write(&root, &params.path) {
        Ok(a) => a,
        Err(e) => return json_err(StatusCode::BAD_REQUEST, e),
    };

    if !abs.exists() {
        return json_err(StatusCode::NOT_FOUND, "note not found");
    }

    match io_utils::atomic_write(&abs, params.content.as_bytes()) {
        Ok(()) => (StatusCode::OK, Json(MutationResponse {
            ok: true,
            path: params.path,
        })).into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_append(
    State(state): State<Arc<HttpAppState>>,
    headers: HeaderMap,
    Json(params): Json<AppendParams>,
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

    let existing = match std::fs::read_to_string(&abs) {
        Ok(c) => c,
        Err(e) => return json_err(StatusCode::NOT_FOUND, format!("Failed to read note: {}", e)),
    };

    let mut new_content = existing;
    if !new_content.ends_with('\n') && !new_content.is_empty() {
        new_content.push('\n');
    }
    new_content.push_str(&params.content);

    match io_utils::atomic_write(&abs, new_content.as_bytes()) {
        Ok(()) => (StatusCode::OK, Json(MutationResponse {
            ok: true,
            path: params.path,
        })).into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_prepend(
    State(state): State<Arc<HttpAppState>>,
    headers: HeaderMap,
    Json(params): Json<PrependParams>,
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

    let existing = match std::fs::read_to_string(&abs) {
        Ok(c) => c,
        Err(e) => return json_err(StatusCode::NOT_FOUND, format!("Failed to read note: {}", e)),
    };

    let new_content = match find_frontmatter_end(&existing) {
        Some(pos) => {
            let mut result = String::with_capacity(existing.len() + params.content.len() + 1);
            result.push_str(&existing[..pos]);
            result.push_str(&params.content);
            if !params.content.ends_with('\n') {
                result.push('\n');
            }
            result.push_str(&existing[pos..]);
            result
        }
        None => {
            let mut result = String::with_capacity(existing.len() + params.content.len() + 1);
            result.push_str(&params.content);
            if !params.content.ends_with('\n') {
                result.push('\n');
            }
            result.push_str(&existing);
            result
        }
    };

    match io_utils::atomic_write(&abs, new_content.as_bytes()) {
        Ok(()) => (StatusCode::OK, Json(MutationResponse {
            ok: true,
            path: params.path,
        })).into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_rename(
    State(state): State<Arc<HttpAppState>>,
    headers: HeaderMap,
    Json(params): Json<RenameParams>,
) -> axum::response::Response {
    if let Err(status) = check_auth(&headers, state.token()) {
        return json_err(status, "Unauthorized");
    }

    match notes_service::rename_note(
        NoteRenameArgs {
            vault_id: params.vault_id,
            from: params.path,
            to: params.new_path.clone(),
        },
        state.app().clone(),
    ) {
        Ok(()) => (StatusCode::OK, Json(MutationResponse {
            ok: true,
            path: params.new_path,
        })).into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_move(
    State(state): State<Arc<HttpAppState>>,
    headers: HeaderMap,
    Json(params): Json<MoveParams>,
) -> axum::response::Response {
    if let Err(status) = check_auth(&headers, state.token()) {
        return json_err(status, "Unauthorized");
    }

    use crate::features::notes::service::{MoveItem, MoveItemsArgs};

    match notes_service::move_items(
        MoveItemsArgs {
            vault_id: params.vault_id,
            items: vec![MoveItem {
                path: params.path,
                is_folder: false,
            }],
            target_folder: params.to.clone(),
            overwrite: false,
        },
        state.app().clone(),
    ) {
        Ok(results) => {
            let first = results.into_iter().next();
            match first {
                Some(r) if r.success => (StatusCode::OK, Json(MutationResponse {
                    ok: true,
                    path: r.new_path,
                })).into_response(),
                Some(r) => json_err(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    r.error.unwrap_or_else(|| "move failed".into()),
                ),
                None => internal_err("no move result".into()),
            }
        }
        Err(e) => internal_err(e),
    }
}

async fn cli_delete(
    State(state): State<Arc<HttpAppState>>,
    headers: HeaderMap,
    Json(params): Json<DeleteParams>,
) -> axum::response::Response {
    if let Err(status) = check_auth(&headers, state.token()) {
        return json_err(status, "Unauthorized");
    }

    match notes_service::delete_note(
        NoteDeleteArgs {
            vault_id: params.vault_id,
            note_id: params.path.clone(),
        },
        state.app().clone(),
    ) {
        Ok(()) => (StatusCode::OK, Json(MutationResponse {
            ok: true,
            path: params.path,
        })).into_response(),
        Err(e) => internal_err(e),
    }
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

    #[test]
    fn test_create_params_deserialization() {
        let json = r##"{"vault_id":"v1","path":"new.md","content":"# Hello","overwrite":false}"##;
        let params: CreateParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.vault_id, "v1");
        assert_eq!(params.path, "new.md");
        assert_eq!(params.content, "# Hello");
        assert!(!params.overwrite);
    }

    #[test]
    fn test_create_params_defaults() {
        let json = r#"{"vault_id":"v1","path":"new.md"}"#;
        let params: CreateParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.content, "");
        assert!(!params.overwrite);
    }

    #[test]
    fn test_write_params_deserialization() {
        let json = r#"{"vault_id":"v1","path":"note.md","content":"updated"}"#;
        let params: WriteParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.path, "note.md");
        assert_eq!(params.content, "updated");
    }

    #[test]
    fn test_rename_params_deserialization() {
        let json = r#"{"vault_id":"v1","path":"old.md","new_path":"new.md"}"#;
        let params: RenameParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.path, "old.md");
        assert_eq!(params.new_path, "new.md");
    }

    #[test]
    fn test_move_params_deserialization() {
        let json = r#"{"vault_id":"v1","path":"note.md","to":"archive/"}"#;
        let params: MoveParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.path, "note.md");
        assert_eq!(params.to, "archive/");
    }

    #[test]
    fn test_delete_params_deserialization() {
        let json = r#"{"vault_id":"v1","path":"trash.md"}"#;
        let params: DeleteParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.path, "trash.md");
    }

    #[test]
    fn test_mutation_response_serialization() {
        let resp = MutationResponse { ok: true, path: "note.md".into() };
        let json = serde_json::to_value(resp).unwrap();
        assert_eq!(json["ok"], true);
        assert_eq!(json["path"], "note.md");
    }

    #[test]
    fn test_find_frontmatter_end_with_frontmatter() {
        let content = "---\ntitle: Hello\n---\n# Body";
        let pos = find_frontmatter_end(content).unwrap();
        assert_eq!(&content[pos..], "# Body");
    }

    #[test]
    fn test_find_frontmatter_end_no_frontmatter() {
        let content = "# Just a heading\nSome text";
        assert_eq!(find_frontmatter_end(content), None);
    }

    #[test]
    fn test_find_frontmatter_end_empty_frontmatter() {
        let content = "---\n---\nBody text";
        let pos = find_frontmatter_end(content).unwrap();
        assert_eq!(&content[pos..], "Body text");
    }

    #[test]
    fn test_find_frontmatter_end_multiline() {
        let content = "---\ntitle: Test\ndate: 2026-01-01\ntags: [a, b]\n---\nContent here";
        let pos = find_frontmatter_end(content).unwrap();
        assert_eq!(&content[pos..], "Content here");
    }
}
