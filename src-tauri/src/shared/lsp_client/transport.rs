use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot, Mutex};

use super::types::{LspClientConfig, LspClientError, ServerRequest};

const STDERR_BUF_LINES: usize = 20;
const STDERR_EXCERPT_LINES: usize = 10;

type StderrBuf = Arc<Mutex<VecDeque<String>>>;

fn stderr_excerpt(buf: &VecDeque<String>) -> String {
    buf.iter()
        .rev()
        .take(STDERR_EXCERPT_LINES)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .cloned()
        .collect::<Vec<_>>()
        .join("\n")
}

enum LspOutgoing {
    Request {
        method: String,
        params: serde_json::Value,
        response_tx: oneshot::Sender<Result<serde_json::Value, LspClientError>>,
    },
    Notification {
        method: String,
        params: serde_json::Value,
    },
}

pub struct LspClient {
    request_tx: mpsc::Sender<LspOutgoing>,
    stop_tx: Option<oneshot::Sender<()>>,
    join_handle: Option<tokio::task::JoinHandle<()>>,
    notification_rx: Option<mpsc::Receiver<ServerNotification>>,
    server_request_rx: Option<mpsc::Receiver<ServerRequest>>,
    server_capabilities: serde_json::Value,
    request_timeout_ms: u64,
}

#[derive(Debug)]
pub struct ServerNotification {
    pub method: String,
    pub params: serde_json::Value,
}

impl LspClient {
    pub async fn start(config: LspClientConfig) -> Result<Self, LspClientError> {
        let (request_tx, request_rx) = mpsc::channel::<LspOutgoing>(64);
        let (stop_tx, stop_rx) = oneshot::channel::<()>();
        let (ready_tx, ready_rx) = oneshot::channel::<Result<serde_json::Value, LspClientError>>();
        let (notification_tx, notification_rx) = mpsc::channel::<ServerNotification>(64);
        let (server_request_tx, server_request_rx) = mpsc::channel::<ServerRequest>(16);

        let request_timeout_ms = config.request_timeout_ms;

        let join_handle = tokio::spawn(lsp_run_loop(
            config,
            request_rx,
            stop_rx,
            ready_tx,
            notification_tx,
            server_request_tx,
        ));

        let server_capabilities = ready_rx
            .await
            .map_err(|_| LspClientError::ChannelClosed)??;

        Ok(Self {
            request_tx,
            stop_tx: Some(stop_tx),
            join_handle: Some(join_handle),
            notification_rx: Some(notification_rx),
            server_request_rx: Some(server_request_rx),
            server_capabilities,
            request_timeout_ms,
        })
    }

    pub fn take_notification_rx(&mut self) -> Option<mpsc::Receiver<ServerNotification>> {
        self.notification_rx.take()
    }

    pub fn take_server_request_rx(&mut self) -> Option<mpsc::Receiver<ServerRequest>> {
        self.server_request_rx.take()
    }

    pub async fn send_notification(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<(), LspClientError> {
        self.request_tx
            .send(LspOutgoing::Notification {
                method: method.to_string(),
                params,
            })
            .await
            .map_err(|_| LspClientError::ChannelClosed)
    }

    pub async fn send_request(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, LspClientError> {
        let (response_tx, response_rx) = oneshot::channel();
        self.request_tx
            .send(LspOutgoing::Request {
                method: method.to_string(),
                params,
                response_tx,
            })
            .await
            .map_err(|_| LspClientError::ChannelClosed)?;

        tokio::time::timeout(
            std::time::Duration::from_millis(self.request_timeout_ms),
            response_rx,
        )
        .await
        .map_err(|_| LspClientError::RequestTimeout)?
        .map_err(|_| LspClientError::ChannelClosed)?
    }

    pub fn completion_trigger_characters(&self) -> Vec<String> {
        log::info!(
            "LSP server capabilities: {}",
            serde_json::to_string_pretty(&self.server_capabilities).unwrap_or_default()
        );
        self.server_capabilities
            .get("capabilities")
            .and_then(|c| c.get("completionProvider"))
            .and_then(|cp| cp.get("triggerCharacters"))
            .and_then(|tc| tc.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn is_alive(&self) -> bool {
        !self.request_tx.is_closed()
    }

    pub async fn stop(mut self) {
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(());
        }
        if let Some(handle) = self.join_handle.take() {
            let _ = handle.await;
        }
    }
}

async fn lsp_run_loop(
    config: LspClientConfig,
    mut request_rx: mpsc::Receiver<LspOutgoing>,
    mut stop_rx: oneshot::Receiver<()>,
    ready_tx: oneshot::Sender<Result<serde_json::Value, LspClientError>>,
    notification_tx: mpsc::Sender<ServerNotification>,
    server_request_tx: mpsc::Sender<ServerRequest>,
) {
    let binary = &config.binary_path;
    let mut cmd = Command::new(binary);
    cmd.args(&config.args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    if let Some(dir) = &config.working_dir {
        cmd.current_dir(dir);
    }
    let child_result = cmd.spawn();

    let mut child: Child = match child_result {
        Ok(c) => c,
        Err(e) => {
            let _ = ready_tx.send(Err(LspClientError::ProcessSpawnFailed(e.to_string())));
            return;
        }
    };

    let stdin = child.stdin.take().expect("stdin piped");
    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");

    let stdin = Arc::new(Mutex::new(stdin));
    let mut stdout_reader = BufReader::new(stdout);

    let stderr_buf: StderrBuf = Arc::new(Mutex::new(VecDeque::with_capacity(STDERR_BUF_LINES)));
    let stderr_buf_clone = stderr_buf.clone();
    let stderr_handle = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        while reader.read_line(&mut line).await.unwrap_or(0) > 0 {
            let trimmed = line.trim().to_string();
            log::warn!("[lsp stderr] {}", trimmed);
            let mut buf = stderr_buf_clone.lock().await;
            if buf.len() >= STDERR_BUF_LINES {
                buf.pop_front();
            }
            buf.push_back(trimmed);
            line.clear();
        }
    });

    let mut next_id: i64 = 1;

    let init_result = lsp_initialize(
        &stdin,
        &mut stdout_reader,
        &mut next_id,
        &config.root_uri,
        config.capabilities.clone(),
        config.init_timeout_ms,
        &stderr_buf,
    )
    .await;
    let server_capabilities = match init_result {
        Ok(caps) => caps,
        Err(e) => {
            log::error!("LSP initialization failed: {}", e);
            let _ = ready_tx.send(Err(e));
            let _ = child.kill().await;
            return;
        }
    };
    let _ = ready_tx.send(Ok(server_capabilities));

    let pending: Arc<
        Mutex<HashMap<i64, oneshot::Sender<Result<serde_json::Value, LspClientError>>>>,
    > = Arc::new(Mutex::new(HashMap::new()));

    let pending_clone = pending.clone();
    let notification_tx_clone = notification_tx;
    let (reader_stop_tx, mut reader_stop_rx) = oneshot::channel::<()>();

    let stdin_clone = stdin.clone();
    let server_request_tx_clone = server_request_tx;
    let reader_handle = tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut reader_stop_rx => break,
                msg = read_lsp_message(&mut stdout_reader) => {
                    match msg {
                        Ok(Some(message)) => {
                            dispatch_message(message, &pending_clone, &notification_tx_clone, &stdin_clone, &server_request_tx_clone).await;
                        }
                        Ok(None) => break,
                        Err(e) => {
                            log::error!("LSP read error: {}", e);
                            break;
                        }
                    }
                }
            }
        }
    });

    loop {
        tokio::select! {
            _ = &mut stop_rx => {
                let _ = lsp_shutdown(&stdin, &mut next_id).await;
                let _ = child.kill().await;
                break;
            }
            msg = request_rx.recv() => {
                match msg {
                    Some(LspOutgoing::Request { method, params, response_tx }) => {
                        let id = next_id;
                        next_id += 1;
                        pending.lock().await.insert(id, response_tx);
                        if let Err(e) = write_lsp_request(&stdin, id, &method, params).await {
                            log::error!("Failed to write LSP request: {}", e);
                            if let Some(tx) = pending.lock().await.remove(&id) {
                                let _ = tx.send(Err(LspClientError::InvalidResponse(e.to_string())));
                            }
                        }
                    }
                    Some(LspOutgoing::Notification { method, params }) => {
                        if let Err(e) = write_lsp_notification(&stdin, &method, params).await {
                            log::error!("Failed to write LSP notification: {}", e);
                        }
                    }
                    None => break,
                }
            }
            status = child.wait() => {
                match status {
                    Ok(s) => log::warn!("LSP process exited: {}", s),
                    Err(e) => log::error!("LSP process error: {}", e),
                }
                break;
            }
        }
    }

    let _ = reader_stop_tx.send(());
    let _ = reader_handle.await;
    let _ = stderr_handle.await;

    let mut pending_guard = pending.lock().await;
    for (_, tx) in pending_guard.drain() {
        let _ = tx.send(Err(LspClientError::ProcessExited));
    }
}

async fn dispatch_message(
    message: serde_json::Value,
    pending: &Arc<Mutex<HashMap<i64, oneshot::Sender<Result<serde_json::Value, LspClientError>>>>>,
    notification_tx: &mpsc::Sender<ServerNotification>,
    stdin: &Arc<Mutex<tokio::process::ChildStdin>>,
    server_request_tx: &mpsc::Sender<ServerRequest>,
) {
    let has_method = message.get("method").is_some();
    let has_id = message.get("id").is_some();

    if has_id && has_method {
        let id_value = message.get("id").cloned().unwrap();
        let method = message
            .get("method")
            .and_then(|m| m.as_str())
            .unwrap_or("unknown");
        log::debug!("LSP server request: {} (id={id_value})", method);

        let params = message
            .get("params")
            .cloned()
            .unwrap_or(serde_json::Value::Null);

        if method == "workspace/applyEdit" {
            let (response_tx, response_rx) = oneshot::channel();
            let sent = server_request_tx
                .send(ServerRequest {
                    id: id_value.clone(),
                    method: method.to_string(),
                    params,
                    response_tx,
                })
                .await;

            let stdin = stdin.clone();
            let id = id_value;
            tokio::spawn(async move {
                let result = if sent.is_ok() {
                    response_rx
                        .await
                        .unwrap_or(serde_json::json!({"applied": false}))
                } else {
                    serde_json::json!({"applied": false})
                };
                let response = serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": result });
                if let Err(e) = write_lsp_message(&stdin, &response).await {
                    log::warn!("Failed to respond to workspace/applyEdit: {}", e);
                }
            });
        } else {
            let response = serde_json::json!({ "jsonrpc": "2.0", "id": id_value, "result": null });
            if let Err(e) = write_lsp_message(stdin, &response).await {
                log::warn!("Failed to respond to server request {}: {}", method, e);
            }

            let _ = notification_tx
                .send(ServerNotification {
                    method: method.to_string(),
                    params,
                })
                .await;
        }
    } else if let Some(id) = message.get("id").and_then(|v| v.as_i64()) {
        let mut pending = pending.lock().await;
        if let Some(tx) = pending.remove(&id) {
            if let Some(error) = message.get("error") {
                let code = error.get("code").and_then(|c| c.as_i64());
                let msg = error.get("message").and_then(|m| m.as_str()).unwrap_or("");
                let detail = match code {
                    Some(c) => format!(
                        "LSP error {}: {}",
                        c,
                        if msg.is_empty() {
                            "method not supported"
                        } else {
                            msg
                        }
                    ),
                    None => {
                        if msg.is_empty() {
                            "unknown LSP error".to_string()
                        } else {
                            msg.to_string()
                        }
                    }
                };
                let _ = tx.send(Err(LspClientError::InvalidResponse(detail)));
            } else {
                let result = message
                    .get("result")
                    .cloned()
                    .unwrap_or(serde_json::Value::Null);
                let _ = tx.send(Ok(result));
            }
        }
    } else if let Some(method) = message.get("method").and_then(|m| m.as_str()) {
        let params = message
            .get("params")
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        let _ = notification_tx
            .send(ServerNotification {
                method: method.to_string(),
                params,
            })
            .await;
    }
}

async fn lsp_initialize(
    stdin: &Arc<Mutex<tokio::process::ChildStdin>>,
    stdout: &mut BufReader<tokio::process::ChildStdout>,
    next_id: &mut i64,
    root_uri: &str,
    capabilities: serde_json::Value,
    init_timeout_ms: u64,
    stderr_buf: &StderrBuf,
) -> Result<serde_json::Value, LspClientError> {
    let id = *next_id;
    *next_id += 1;

    let params = serde_json::json!({
        "processId": std::process::id(),
        "rootUri": root_uri,
        "capabilities": capabilities
    });

    write_lsp_request(stdin, id, "initialize", params)
        .await
        .map_err(|e| LspClientError::InitFailed {
            message: e.to_string(),
            stderr_excerpt: String::new(),
        })?;

    let read_result = tokio::time::timeout(
        std::time::Duration::from_millis(init_timeout_ms),
        read_lsp_message(stdout),
    )
    .await;

    let response = match read_result {
        Err(_) => {
            let excerpt = stderr_excerpt(&*stderr_buf.lock().await);
            return Err(LspClientError::InitTimeout {
                stderr_excerpt: excerpt,
            });
        }
        Ok(Err(e)) => {
            let excerpt = stderr_excerpt(&*stderr_buf.lock().await);
            return Err(LspClientError::InitFailed {
                message: e.to_string(),
                stderr_excerpt: excerpt,
            });
        }
        Ok(Ok(None)) => {
            let excerpt = stderr_excerpt(&*stderr_buf.lock().await);
            return Err(LspClientError::InitEof {
                stderr_excerpt: excerpt,
            });
        }
        Ok(Ok(Some(msg))) => msg,
    };

    if let Some(error) = response.get("error") {
        let msg = error
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("unknown");
        let excerpt = stderr_excerpt(&*stderr_buf.lock().await);
        return Err(LspClientError::InitFailed {
            message: msg.to_string(),
            stderr_excerpt: excerpt,
        });
    }

    let result = response
        .get("result")
        .cloned()
        .unwrap_or(serde_json::Value::Null);

    write_lsp_notification(stdin, "initialized", serde_json::json!({}))
        .await
        .map_err(|e| LspClientError::InitFailed {
            message: e.to_string(),
            stderr_excerpt: String::new(),
        })?;
    Ok(result)
}

async fn lsp_shutdown(
    stdin: &Arc<Mutex<tokio::process::ChildStdin>>,
    next_id: &mut i64,
) -> Result<(), anyhow::Error> {
    let id = *next_id;
    *next_id += 1;
    let _ = write_lsp_request(stdin, id, "shutdown", serde_json::Value::Null).await;
    let _ = write_lsp_notification(stdin, "exit", serde_json::Value::Null).await;
    Ok(())
}

async fn write_lsp_request(
    stdin: &Arc<Mutex<tokio::process::ChildStdin>>,
    id: i64,
    method: &str,
    params: serde_json::Value,
) -> Result<(), anyhow::Error> {
    let message =
        serde_json::json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
    write_lsp_message(stdin, &message).await
}

async fn write_lsp_notification(
    stdin: &Arc<Mutex<tokio::process::ChildStdin>>,
    method: &str,
    params: serde_json::Value,
) -> Result<(), anyhow::Error> {
    let message = serde_json::json!({ "jsonrpc": "2.0", "method": method, "params": params });
    write_lsp_message(stdin, &message).await
}

async fn write_lsp_message(
    stdin: &Arc<Mutex<tokio::process::ChildStdin>>,
    message: &serde_json::Value,
) -> Result<(), anyhow::Error> {
    let body = serde_json::to_string(message)?;
    let header = format!("Content-Length: {}\r\n\r\n", body.len());
    let mut stdin = stdin.lock().await;
    stdin.write_all(header.as_bytes()).await?;
    stdin.write_all(body.as_bytes()).await?;
    stdin.flush().await?;
    Ok(())
}

async fn read_lsp_message(
    reader: &mut BufReader<tokio::process::ChildStdout>,
) -> Result<Option<serde_json::Value>, anyhow::Error> {
    let mut content_length: Option<usize> = None;
    let mut header_line = String::new();

    loop {
        header_line.clear();
        let bytes_read = reader.read_line(&mut header_line).await?;
        if bytes_read == 0 {
            return Ok(None);
        }
        let trimmed = header_line.trim();
        if trimmed.is_empty() {
            break;
        }
        if let Some(len_str) = trimmed.strip_prefix("Content-Length: ") {
            content_length = Some(len_str.parse::<usize>()?);
        }
    }

    let content_length = content_length.ok_or_else(|| anyhow::anyhow!("Missing Content-Length"))?;
    let mut body = vec![0u8; content_length];
    reader.read_exact(&mut body).await?;
    let message: serde_json::Value = serde_json::from_slice(&body)?;
    Ok(Some(message))
}
