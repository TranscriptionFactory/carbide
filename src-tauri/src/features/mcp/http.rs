use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;
use specta::Type;
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::net::TcpListener;
use tokio::sync::watch;
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::features::mcp::auth;
use crate::features::mcp::cli_routes;
use crate::features::mcp::router::McpRouter;
use crate::features::mcp::types::{JsonRpcRequest, JsonRpcResponse, JsonRpcError, PARSE_ERROR};

pub const DEFAULT_PORT: u16 = 3457;

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HttpServerInfo {
    pub port: u16,
    pub running: bool,
}

#[derive(Clone)]
#[allow(dead_code)]
pub struct HttpAppState {
    app: AppHandle,
    token: String,
}

impl HttpAppState {
    pub fn new(app: AppHandle, token: String) -> Self {
        Self { app, token }
    }

    pub fn app(&self) -> &AppHandle {
        &self.app
    }

    pub(crate) fn token(&self) -> &str {
        &self.token
    }
}

fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(|origin, _| {
            if let Ok(s) = origin.to_str() {
                s.starts_with("http://localhost")
                    || s.starts_with("http://127.0.0.1")
                    || s.starts_with("https://localhost")
                    || s.starts_with("https://127.0.0.1")
                    || s.starts_with("tauri://")
            } else {
                false
            }
        }))
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::OPTIONS,
        ])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
        ])
}

pub fn build_router(state: HttpAppState) -> Router {
    Router::new()
        .route("/health", get(health_handler))
        .route("/mcp", post(mcp_handler))
        .nest("/cli", cli_routes::cli_router())
        .layer(cors_layer())
        .with_state(Arc::new(state))
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    version: &'static str,
}

async fn health_handler() -> impl IntoResponse {
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

async fn mcp_handler(
    State(state): State<Arc<HttpAppState>>,
    headers: HeaderMap,
    body: String,
) -> impl IntoResponse {
    if let Err(status) = check_auth(&headers, state.token()) {
        return (status, Json(JsonRpcResponse::error(
            None,
            JsonRpcError {
                code: -32000,
                message: "Unauthorized".into(),
                data: None,
            },
        ))).into_response();
    }

    let request = match serde_json::from_str::<JsonRpcRequest>(&body) {
        Ok(req) => req,
        Err(e) => {
            return (StatusCode::OK, Json(JsonRpcResponse::error(
                None,
                JsonRpcError {
                    code: PARSE_ERROR,
                    message: format!("Parse error: {}", e),
                    data: None,
                },
            ))).into_response();
        }
    };

    let mut router = McpRouter::with_app(state.app().clone());
    match router.handle_request(&request) {
        Some(response) => (StatusCode::OK, Json(response)).into_response(),
        None => StatusCode::NO_CONTENT.into_response(),
    }
}

pub fn extract_bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
}

pub fn check_auth(headers: &HeaderMap, expected_token: &str) -> Result<(), StatusCode> {
    let provided = extract_bearer_token(headers).ok_or(StatusCode::UNAUTHORIZED)?;
    if auth::verify_token(provided, expected_token) {
        Ok(())
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

pub async fn start_server(
    state: HttpAppState,
    port: u16,
    mut shutdown_rx: watch::Receiver<bool>,
) -> Result<(), String> {
    let router = build_router(state);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));

    let listener = TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Failed to bind HTTP server to {}: {}", addr, e))?;

    log::info!("HTTP server listening on {}", addr);

    axum::serve(listener, router)
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.wait_for(|v| *v).await;
            log::info!("HTTP server shutting down");
        })
        .await
        .map_err(|e| format!("HTTP server error: {}", e))?;

    log::info!("HTTP server stopped");
    Ok(())
}

pub struct HttpServerState {
    shutdown_tx: Arc<tokio::sync::Mutex<Option<watch::Sender<bool>>>>,
    task_handle: Arc<tokio::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>,
    running: Arc<tokio::sync::Mutex<bool>>,
    port: u16,
}

impl Default for HttpServerState {
    fn default() -> Self {
        Self {
            shutdown_tx: Arc::new(tokio::sync::Mutex::new(None)),
            task_handle: Arc::new(tokio::sync::Mutex::new(None)),
            running: Arc::new(tokio::sync::Mutex::new(false)),
            port: DEFAULT_PORT,
        }
    }
}

impl HttpServerState {
    pub async fn start(&self, app: AppHandle) -> Result<HttpServerInfo, String> {
        let mut running = self.running.lock().await;
        if *running {
            return Ok(HttpServerInfo {
                port: self.port,
                running: true,
            });
        }

        let token = auth::read_or_create_token()?;
        let state = HttpAppState::new(app, token);
        let port = self.port;

        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        let handle = tokio::spawn(async move {
            if let Err(e) = start_server(state, port, shutdown_rx).await {
                log::error!("HTTP server error: {}", e);
            }
        });

        *self.shutdown_tx.lock().await = Some(shutdown_tx);
        *self.task_handle.lock().await = Some(handle);
        *running = true;

        log::info!("HTTP server started on port {}", port);

        Ok(HttpServerInfo {
            port: self.port,
            running: true,
        })
    }

    pub async fn stop(&self) -> Result<(), String> {
        let mut running = self.running.lock().await;
        if !*running {
            return Ok(());
        }

        if let Some(tx) = self.shutdown_tx.lock().await.take() {
            let _ = tx.send(true);
        }

        if let Some(handle) = self.task_handle.lock().await.take() {
            let _ = tokio::time::timeout(std::time::Duration::from_secs(5), handle).await;
        }

        *running = false;
        log::info!("HTTP server stopped");
        Ok(())
    }

    pub async fn get_info(&self) -> HttpServerInfo {
        HttpServerInfo {
            port: self.port,
            running: *self.running.lock().await,
        }
    }

    pub async fn shutdown(&self) {
        if let Err(e) = self.stop().await {
            log::error!("HTTP server shutdown error: {}", e);
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn http_server_start(
    app: AppHandle,
    state: tauri::State<'_, HttpServerState>,
) -> Result<HttpServerInfo, String> {
    state.start(app).await
}

#[tauri::command]
#[specta::specta]
pub async fn http_server_stop(
    state: tauri::State<'_, HttpServerState>,
) -> Result<(), String> {
    state.stop().await
}

#[tauri::command]
#[specta::specta]
pub async fn http_server_status(
    state: tauri::State<'_, HttpServerState>,
) -> Result<HttpServerInfo, String> {
    Ok(state.get_info().await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    fn test_mcp_router(token: &str) -> Router {
        Router::new()
            .route("/mcp", post(mcp_handler_no_app))
            .with_state(Arc::new(token.to_string()))
    }

    async fn mcp_handler_no_app(
        State(token): State<Arc<String>>,
        headers: HeaderMap,
        body: String,
    ) -> impl IntoResponse {
        if let Err(status) = check_auth(&headers, &token) {
            return (status, Json(JsonRpcResponse::error(
                None,
                JsonRpcError {
                    code: -32000,
                    message: "Unauthorized".into(),
                    data: None,
                },
            ))).into_response();
        }

        let request = match serde_json::from_str::<JsonRpcRequest>(&body) {
            Ok(req) => req,
            Err(e) => {
                return (StatusCode::OK, Json(JsonRpcResponse::error(
                    None,
                    JsonRpcError {
                        code: PARSE_ERROR,
                        message: format!("Parse error: {}", e),
                        data: None,
                    },
                ))).into_response();
            }
        };

        let mut router = McpRouter::new();
        match router.handle_request(&request) {
            Some(response) => (StatusCode::OK, Json(response)).into_response(),
            None => StatusCode::NO_CONTENT.into_response(),
        }
    }

    fn mcp_request(router: Router, token: &str, body: &str) -> Request<Body> {
        Request::builder()
            .method("POST")
            .uri("/mcp")
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", token))
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    async fn response_json(resp: axum::response::Response) -> serde_json::Value {
        let body = axum::body::to_bytes(resp.into_body(), 4096).await.unwrap();
        serde_json::from_slice(&body).unwrap()
    }

    #[tokio::test]
    async fn test_mcp_endpoint_auth_rejected_no_token() {
        let router = test_mcp_router("secret");
        let req = Request::builder()
            .method("POST")
            .uri("/mcp")
            .header("Content-Type", "application/json")
            .body(Body::from("{}"))
            .unwrap();

        let resp = ServiceExt::<Request<Body>>::oneshot(router, req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);

        let json = response_json(resp).await;
        assert_eq!(json["error"]["message"], "Unauthorized");
    }

    #[tokio::test]
    async fn test_mcp_endpoint_auth_rejected_wrong_token() {
        let router = test_mcp_router("secret");
        let req = mcp_request(router.clone(), "wrong", r#"{"jsonrpc":"2.0","method":"ping","id":1}"#);
        let resp = ServiceExt::<Request<Body>>::oneshot(router, req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_mcp_endpoint_malformed_json() {
        let router = test_mcp_router("secret");
        let req = mcp_request(router.clone(), "secret", "not json");
        let resp = ServiceExt::<Request<Body>>::oneshot(router, req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let json = response_json(resp).await;
        assert_eq!(json["error"]["code"], PARSE_ERROR);
        assert!(json["error"]["message"].as_str().unwrap().contains("Parse error"));
    }

    #[tokio::test]
    async fn test_mcp_endpoint_ping() {
        let router = test_mcp_router("secret");
        let body = r#"{"jsonrpc":"2.0","method":"ping","id":1}"#;
        let req = mcp_request(router.clone(), "secret", body);
        let resp = ServiceExt::<Request<Body>>::oneshot(router, req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let json = response_json(resp).await;
        assert_eq!(json["jsonrpc"], "2.0");
        assert!(json["result"].is_object());
        assert!(json["error"].is_null());
    }

    #[tokio::test]
    async fn test_mcp_endpoint_tools_list() {
        let router = test_mcp_router("secret");
        let body = r#"{"jsonrpc":"2.0","method":"tools/list","id":2}"#;
        let req = mcp_request(router.clone(), "secret", body);
        let resp = ServiceExt::<Request<Body>>::oneshot(router, req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let json = response_json(resp).await;
        assert!(json["result"]["tools"].is_array());
        assert!(json["result"]["tools"].as_array().unwrap().len() > 0);
    }

    #[tokio::test]
    async fn test_mcp_endpoint_unknown_method() {
        let router = test_mcp_router("secret");
        let body = r#"{"jsonrpc":"2.0","method":"unknown/method","id":3}"#;
        let req = mcp_request(router.clone(), "secret", body);
        let resp = ServiceExt::<Request<Body>>::oneshot(router, req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let json = response_json(resp).await;
        assert_eq!(json["error"]["code"], -32601);
    }

    #[tokio::test]
    async fn test_mcp_endpoint_notification_returns_no_content() {
        let router = test_mcp_router("secret");
        let body = r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#;
        let req = mcp_request(router.clone(), "secret", body);
        let resp = ServiceExt::<Request<Body>>::oneshot(router, req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    }

    #[test]
    fn test_extract_bearer_token_valid() {
        let mut headers = HeaderMap::new();
        headers.insert(
            axum::http::header::AUTHORIZATION,
            "Bearer abc123".parse().unwrap(),
        );
        assert_eq!(extract_bearer_token(&headers), Some("abc123"));
    }

    #[test]
    fn test_extract_bearer_token_missing() {
        let headers = HeaderMap::new();
        assert_eq!(extract_bearer_token(&headers), None);
    }

    #[test]
    fn test_extract_bearer_token_wrong_scheme() {
        let mut headers = HeaderMap::new();
        headers.insert(
            axum::http::header::AUTHORIZATION,
            "Basic abc123".parse().unwrap(),
        );
        assert_eq!(extract_bearer_token(&headers), None);
    }

    #[test]
    fn test_check_auth_valid() {
        let mut headers = HeaderMap::new();
        headers.insert(
            axum::http::header::AUTHORIZATION,
            "Bearer mytoken".parse().unwrap(),
        );
        assert!(check_auth(&headers, "mytoken").is_ok());
    }

    #[test]
    fn test_check_auth_invalid_token() {
        let mut headers = HeaderMap::new();
        headers.insert(
            axum::http::header::AUTHORIZATION,
            "Bearer wrong".parse().unwrap(),
        );
        assert_eq!(check_auth(&headers, "mytoken"), Err(StatusCode::UNAUTHORIZED));
    }

    #[test]
    fn test_check_auth_missing_header() {
        let headers = HeaderMap::new();
        assert_eq!(check_auth(&headers, "mytoken"), Err(StatusCode::UNAUTHORIZED));
    }

    #[test]
    fn test_health_response_serialization() {
        let resp = HealthResponse {
            status: "ok",
            version: "1.0.0",
        };
        let json = serde_json::to_value(resp).unwrap();
        assert_eq!(json["status"], "ok");
        assert_eq!(json["version"], "1.0.0");
    }

    #[tokio::test]
    async fn test_health_endpoint() {
        use axum::body::Body;
        use axum::http::Request;
        use tower::ServiceExt;

        let router = Router::new().route("/health", get(health_handler));

        let req = Request::builder()
            .uri("/health")
            .body(Body::empty())
            .unwrap();

        let resp = ServiceExt::<Request<Body>>::oneshot(router, req)
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), 1024).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["status"], "ok");
    }

    #[tokio::test]
    async fn test_server_start_stop_lifecycle() {
        let state = HttpServerState {
            port: 0,
            ..Default::default()
        };

        let info = state.get_info().await;
        assert!(!info.running);

        let stop_result = state.stop().await;
        assert!(stop_result.is_ok());
    }
}
