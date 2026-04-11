use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::post;
use axum::{Json, Router};
use serde::Serialize;
use std::sync::Arc;

use serde::Deserialize;

use crate::features::git::service as git_service;
use crate::features::mcp::http::HttpAppState;
use crate::features::mcp::shared_ops::{
    self, CreateNoteArgs as SharedCreateArgs, CreateResult, OpError,
};
use crate::features::notes::service as notes_service;
use crate::features::reference::service as reference_service;
use crate::features::search::db as search_db;
use crate::features::search::model::{BaseFilter, BaseQuery, BaseSort};
use crate::features::search::service as search_service;
use crate::features::tasks::service as tasks_service;
use crate::features::tasks::types::{TaskFilter, TaskQuery, TaskSort, TaskStatus};
use crate::shared::{io_utils, storage};

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
        .route("/notes_by_tag", post(cli_notes_by_tag))
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
        .route("/reindex", post(cli_reindex))
        .route("/git/status", post(cli_git_status))
        .route("/git/commit", post(cli_git_commit))
        .route("/git/log", post(cli_git_log))
        .route("/git/diff", post(cli_git_diff))
        .route("/git/push", post(cli_git_push))
        .route("/git/pull", post(cli_git_pull))
        .route("/git/restore", post(cli_git_restore))
        .route("/git/init", post(cli_git_init))
        .route("/references", post(cli_references))
        .route("/references/search", post(cli_references_search))
        .route("/references/add", post(cli_references_add))
        .route("/references/bbt/search", post(cli_references_bbt_search))
        .route("/bases/query", post(cli_bases_query))
        .route("/bases/properties", post(cli_bases_properties))
        .route("/tasks", post(cli_tasks))
        .route("/tasks/update", post(cli_tasks_update))
        .route("/dev/index/build", post(cli_dev_index_build))
        .route("/dev/index/rebuild", post(cli_dev_index_rebuild))
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

async fn cli_notes_by_tag(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::NotesForTagArgs>,
) -> axum::response::Response {
    match shared_ops::notes_for_tag(state.app(), &params.vault_id, &params.tag) {
        Ok(paths) => (StatusCode::OK, Json(paths)).into_response(),
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

async fn cli_reindex(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::VaultIdArgs>,
) -> axum::response::Response {
    match shared_ops::reindex(state.app(), &params.vault_id) {
        Ok(()) => (
            StatusCode::OK,
            Json(MutationResponse {
                ok: true,
                path: String::new(),
            }),
        )
            .into_response(),
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

// --- Git routes ---

fn internal_err(msg: String) -> axum::response::Response {
    json_err(StatusCode::INTERNAL_SERVER_ERROR, msg)
}

fn resolve_vault_root(
    state: &HttpAppState,
    vault_id: &str,
) -> Result<String, axum::response::Response> {
    storage::vault_path(state.app(), vault_id)
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(internal_err)
}

#[derive(Deserialize)]
struct GitCommitParams {
    vault_id: String,
    message: String,
    #[serde(default)]
    files: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct GitLogParams {
    vault_id: String,
    #[serde(default)]
    file_path: Option<String>,
    #[serde(default = "default_git_log_limit")]
    limit: usize,
}

fn default_git_log_limit() -> usize {
    20
}

#[derive(Deserialize)]
struct GitDiffParams {
    vault_id: String,
    #[serde(default)]
    path: Option<String>,
}

#[derive(Deserialize)]
struct GitPullParams {
    vault_id: String,
    #[serde(default)]
    strategy: Option<String>,
}

#[derive(Deserialize)]
struct GitRestoreParams {
    vault_id: String,
    path: String,
    commit: String,
}

async fn cli_git_status(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::VaultIdArgs>,
) -> axum::response::Response {
    let root = match resolve_vault_root(&state, &params.vault_id) {
        Ok(r) => r,
        Err(resp) => return resp,
    };
    match git_service::git_status(root) {
        Ok(status) => (StatusCode::OK, Json(status)).into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_git_commit(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<GitCommitParams>,
) -> axum::response::Response {
    let root = match resolve_vault_root(&state, &params.vault_id) {
        Ok(r) => r,
        Err(resp) => return resp,
    };
    match git_service::git_stage_and_commit(root, params.message, params.files) {
        Ok(hash) => (
            StatusCode::OK,
            Json(serde_json::json!({ "ok": true, "hash": hash })),
        )
            .into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_git_log(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<GitLogParams>,
) -> axum::response::Response {
    let root = match resolve_vault_root(&state, &params.vault_id) {
        Ok(r) => r,
        Err(resp) => return resp,
    };
    let limit = params.limit.min(100);
    match git_service::collect_git_log(&root, params.file_path.as_deref(), limit) {
        Ok(commits) => (StatusCode::OK, Json(commits)).into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_git_diff(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<GitDiffParams>,
) -> axum::response::Response {
    let root = match resolve_vault_root(&state, &params.vault_id) {
        Ok(r) => r,
        Err(resp) => return resp,
    };
    match git_service::git_diff_working(&root, params.path.as_deref()) {
        Ok(diff) => (StatusCode::OK, Json(diff)).into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_git_push(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::VaultIdArgs>,
) -> axum::response::Response {
    let root = match resolve_vault_root(&state, &params.vault_id) {
        Ok(r) => r,
        Err(resp) => return resp,
    };
    let result = git_service::git_push(root);
    (StatusCode::OK, Json(result)).into_response()
}

async fn cli_git_pull(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<GitPullParams>,
) -> axum::response::Response {
    let root = match resolve_vault_root(&state, &params.vault_id) {
        Ok(r) => r,
        Err(resp) => return resp,
    };
    let result = git_service::git_pull(root, params.strategy);
    (StatusCode::OK, Json(result)).into_response()
}

async fn cli_git_restore(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<GitRestoreParams>,
) -> axum::response::Response {
    let root = match resolve_vault_root(&state, &params.vault_id) {
        Ok(r) => r,
        Err(resp) => return resp,
    };
    match git_service::git_restore_file(root, params.path, params.commit) {
        Ok(hash) => (
            StatusCode::OK,
            Json(serde_json::json!({ "ok": true, "hash": hash })),
        )
            .into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_git_init(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::VaultIdArgs>,
) -> axum::response::Response {
    let root = match resolve_vault_root(&state, &params.vault_id) {
        Ok(r) => r,
        Err(resp) => return resp,
    };
    match git_service::git_init_repo(root) {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => internal_err(e),
    }
}

// --- Reference routes ---

#[derive(Deserialize)]
struct ReferencesSearchParams {
    vault_id: String,
    query: String,
}

#[derive(Deserialize)]
struct ReferencesAddParams {
    vault_id: String,
    doi: String,
}

#[derive(Deserialize)]
struct ReferencesBbtSearchParams {
    #[serde(default)]
    query: String,
    #[serde(default)]
    limit: Option<u32>,
    #[serde(default)]
    bbt_url: Option<String>,
}

async fn cli_references(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::VaultIdArgs>,
) -> axum::response::Response {
    match reference_service::reference_load_library(state.app().clone(), params.vault_id) {
        Ok(library) => (StatusCode::OK, Json(library.items)).into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_references_search(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<ReferencesSearchParams>,
) -> axum::response::Response {
    let library =
        match reference_service::reference_load_library(state.app().clone(), params.vault_id) {
            Ok(lib) => lib,
            Err(e) => return internal_err(e),
        };

    let query_lower = params.query.to_lowercase();
    let matches: Vec<&serde_json::Value> = library
        .items
        .iter()
        .filter(|item| {
            let text = serde_json::to_string(item)
                .unwrap_or_default()
                .to_lowercase();
            text.contains(&query_lower)
        })
        .collect();

    (StatusCode::OK, Json(matches)).into_response()
}

async fn cli_references_add(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<ReferencesAddParams>,
) -> axum::response::Response {
    let item = match reference_service::reference_doi_lookup(params.doi).await {
        Ok(Some(item)) => item,
        Ok(None) => return json_err(StatusCode::NOT_FOUND, "DOI not found"),
        Err(e) => return internal_err(e),
    };

    match reference_service::reference_add_item(state.app().clone(), params.vault_id, item.clone())
    {
        Ok(_library) => (StatusCode::CREATED, Json(item)).into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_references_bbt_search(
    State(_state): State<Arc<HttpAppState>>,
    Json(params): Json<ReferencesBbtSearchParams>,
) -> axum::response::Response {
    const DEFAULT_BBT_URL: &str = "http://localhost:23119/better-bibtex/json-rpc";
    let bbt_url = params
        .bbt_url
        .unwrap_or_else(|| DEFAULT_BBT_URL.to_string());

    match reference_service::reference_bbt_search(bbt_url, params.query, params.limit).await {
        Ok(items) => (StatusCode::OK, Json(items)).into_response(),
        Err(e) => internal_err(e),
    }
}

// --- Bases routes ---

#[derive(Deserialize)]
struct BasesQueryParams {
    vault_id: String,
    #[serde(default)]
    filters: Vec<BaseFilter>,
    #[serde(default)]
    sort: Vec<BaseSort>,
    #[serde(default = "default_bases_limit")]
    limit: usize,
    #[serde(default)]
    offset: usize,
}

fn default_bases_limit() -> usize {
    100
}

async fn cli_bases_query(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<BasesQueryParams>,
) -> axum::response::Response {
    let limit = params.limit.min(500);
    let query = BaseQuery {
        filters: params.filters,
        sort: params.sort,
        limit,
        offset: params.offset,
    };

    match search_service::with_read_conn(state.app(), &params.vault_id, |conn| {
        search_db::query_bases(conn, query)
    }) {
        Ok(results) => (StatusCode::OK, Json(results)).into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_bases_properties(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::VaultIdArgs>,
) -> axum::response::Response {
    match search_service::with_read_conn(state.app(), &params.vault_id, |conn| {
        search_db::list_all_properties(conn)
    }) {
        Ok(props) => (StatusCode::OK, Json(props)).into_response(),
        Err(e) => internal_err(e),
    }
}

// --- Tasks routes ---

#[derive(Deserialize)]
struct TasksQueryParams {
    vault_id: String,
    #[serde(default)]
    filters: Vec<TaskFilter>,
    #[serde(default)]
    sort: Vec<TaskSort>,
    #[serde(default = "default_tasks_limit")]
    limit: usize,
    #[serde(default)]
    offset: usize,
}

fn default_tasks_limit() -> usize {
    100
}

#[derive(Deserialize)]
struct TaskUpdateParams {
    vault_id: String,
    path: String,
    line_number: usize,
    status: TaskStatus,
}

async fn cli_tasks(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<TasksQueryParams>,
) -> axum::response::Response {
    let limit = params.limit.min(500);
    let query = TaskQuery {
        filters: params.filters,
        sort: params.sort,
        limit,
        offset: params.offset,
    };

    match search_service::with_read_conn(state.app(), &params.vault_id, |conn| {
        tasks_service::query_tasks(conn, query)
    }) {
        Ok(tasks) => (StatusCode::OK, Json(tasks)).into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_tasks_update(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<TaskUpdateParams>,
) -> axum::response::Response {
    let root = match resolve_vault_root(&state, &params.vault_id) {
        Ok(r) => r,
        Err(resp) => return resp,
    };

    let root_path = std::path::Path::new(&root);
    let abs_path = match notes_service::safe_vault_abs(root_path, &params.path) {
        Ok(a) => a,
        Err(e) => return json_err(StatusCode::BAD_REQUEST, e),
    };

    if let Err(e) =
        tasks_service::update_task_state_in_file(&abs_path, params.line_number, params.status)
    {
        return internal_err(e);
    }

    let content = match io_utils::read_file_to_string(&abs_path) {
        Ok(c) => c,
        Err(e) => return internal_err(e),
    };
    let tasks = tasks_service::extract_tasks(&params.path, &content);
    let conn = match search_db::open_search_db(state.app(), &params.vault_id) {
        Ok(c) => c,
        Err(e) => return internal_err(e),
    };
    match tasks_service::save_tasks(&conn, &params.path, &tasks) {
        Ok(()) => (
            StatusCode::OK,
            Json(serde_json::json!({ "ok": true, "path": params.path })),
        )
            .into_response(),
        Err(e) => internal_err(e),
    }
}

// --- Dev routes ---

async fn cli_dev_index_build(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::VaultIdArgs>,
) -> axum::response::Response {
    match search_service::index_build(state.app().clone(), params.vault_id) {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => internal_err(e),
    }
}

async fn cli_dev_index_rebuild(
    State(state): State<Arc<HttpAppState>>,
    Json(params): Json<shared_ops::VaultIdArgs>,
) -> axum::response::Response {
    match search_service::index_rebuild(state.app().clone(), params.vault_id) {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => internal_err(e),
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

    #[test]
    fn test_git_commit_params_deserialization() {
        let json = r#"{"vault_id":"v1","message":"checkpoint"}"#;
        let params: GitCommitParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.vault_id, "v1");
        assert_eq!(params.message, "checkpoint");
        assert!(params.files.is_none());
    }

    #[test]
    fn test_git_commit_params_with_files() {
        let json = r#"{"vault_id":"v1","message":"save","files":["a.md","b.md"]}"#;
        let params: GitCommitParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.files.unwrap().len(), 2);
    }

    #[test]
    fn test_git_log_params_defaults() {
        let json = r#"{"vault_id":"v1"}"#;
        let params: GitLogParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.limit, 20);
        assert!(params.file_path.is_none());
    }

    #[test]
    fn test_git_diff_params_deserialization() {
        let json = r#"{"vault_id":"v1","path":"notes/test.md"}"#;
        let params: GitDiffParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.path.as_deref(), Some("notes/test.md"));
    }

    #[test]
    fn test_git_restore_params_deserialization() {
        let json = r#"{"vault_id":"v1","path":"note.md","commit":"abc123"}"#;
        let params: GitRestoreParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.path, "note.md");
        assert_eq!(params.commit, "abc123");
    }

    #[test]
    fn test_references_search_params_deserialization() {
        let json = r#"{"vault_id":"v1","query":"machine learning"}"#;
        let params: ReferencesSearchParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.query, "machine learning");
    }

    #[test]
    fn test_references_add_params_deserialization() {
        let json = r#"{"vault_id":"v1","doi":"10.1038/nature12373"}"#;
        let params: ReferencesAddParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.doi, "10.1038/nature12373");
    }

    #[test]
    fn test_references_bbt_search_params_defaults() {
        let json = r#"{"query":"neural"}"#;
        let params: ReferencesBbtSearchParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.query, "neural");
        assert!(params.limit.is_none());
        assert!(params.bbt_url.is_none());
    }

    #[test]
    fn test_default_git_log_limit() {
        assert_eq!(default_git_log_limit(), 20);
    }

    #[test]
    fn test_bases_query_params_defaults() {
        let json = r#"{"vault_id":"v1"}"#;
        let params: BasesQueryParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.vault_id, "v1");
        assert!(params.filters.is_empty());
        assert!(params.sort.is_empty());
        assert_eq!(params.limit, 100);
        assert_eq!(params.offset, 0);
    }

    #[test]
    fn test_bases_query_params_with_filters() {
        let json = r#"{"vault_id":"v1","filters":[{"property":"status","operator":"eq","value":"draft"}],"sort":[{"property":"mtime_ms","descending":true}],"limit":50}"#;
        let params: BasesQueryParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.filters.len(), 1);
        assert_eq!(params.filters[0].property, "status");
        assert_eq!(params.sort.len(), 1);
        assert!(params.sort[0].descending);
        assert_eq!(params.limit, 50);
    }

    #[test]
    fn test_tasks_query_params_defaults() {
        let json = r#"{"vault_id":"v1"}"#;
        let params: TasksQueryParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.vault_id, "v1");
        assert!(params.filters.is_empty());
        assert_eq!(params.limit, 100);
    }

    #[test]
    fn test_tasks_query_params_with_filters() {
        let json = r#"{"vault_id":"v1","filters":[{"property":"status","operator":"eq","value":"todo"}],"limit":20}"#;
        let params: TasksQueryParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.filters.len(), 1);
        assert_eq!(params.filters[0].value, "todo");
        assert_eq!(params.limit, 20);
    }

    #[test]
    fn test_task_update_params_deserialization() {
        let json = r#"{"vault_id":"v1","path":"todo.md","line_number":5,"status":"done"}"#;
        let params: TaskUpdateParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.path, "todo.md");
        assert_eq!(params.line_number, 5);
        assert!(matches!(params.status, TaskStatus::Done));
    }

    #[test]
    fn test_default_bases_limit() {
        assert_eq!(default_bases_limit(), 100);
    }

    #[test]
    fn test_default_tasks_limit() {
        assert_eq!(default_tasks_limit(), 100);
    }
}
