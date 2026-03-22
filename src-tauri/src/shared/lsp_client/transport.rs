use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot, Mutex};

use super::types::{LspClientConfig, LspClientError};

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
        let (ready_tx, ready_rx) = oneshot::channel::<Result<(), LspClientError>>();
        let (notification_tx, notification_rx) = mpsc::channel::<ServerNotification>(64);

        let join_handle = tokio::spawn(lsp_run_loop(
            config,
            request_rx,
            stop_rx,
            ready_tx,
            notification_tx,
        ));

        ready_rx.await.map_err(|_| LspClientError::ChannelClosed)??;

        Ok(Self {
            request_tx,
            stop_tx: Some(stop_tx),
            join_handle: Some(join_handle),
            notification_rx: Some(notification_rx),
        })
    }

    pub fn take_notification_rx(&mut self) -> Option<mpsc::Receiver<ServerNotification>> {
        self.notification_rx.take()
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

        response_rx
            .await
            .map_err(|_| LspClientError::ChannelClosed)?
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
    ready_tx: oneshot::Sender<Result<(), LspClientError>>,
    notification_tx: mpsc::Sender<ServerNotification>,
) {
    let binary = &config.binary_path;
    let child_result = Command::new(binary)
        .args(&config.args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn();

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

    let stderr_handle = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        while reader.read_line(&mut line).await.unwrap_or(0) > 0 {
            log::debug!("[lsp stderr] {}", line.trim());
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
    )
    .await;
    if let Err(e) = init_result {
        log::error!("LSP initialization failed: {}", e);
        let _ = ready_tx.send(Err(LspClientError::ProcessSpawnFailed(e.to_string())));
        let _ = child.kill().await;
        return;
    }
    let _ = ready_tx.send(Ok(()));

    let pending: Arc<
        Mutex<HashMap<i64, oneshot::Sender<Result<serde_json::Value, LspClientError>>>>,
    > = Arc::new(Mutex::new(HashMap::new()));

    let pending_clone = pending.clone();
    let notification_tx_clone = notification_tx;
    let (reader_stop_tx, mut reader_stop_rx) = oneshot::channel::<()>();

    let reader_handle = tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut reader_stop_rx => break,
                msg = read_lsp_message(&mut stdout_reader) => {
                    match msg {
                        Ok(Some(message)) => {
                            dispatch_message(message, &pending_clone, &notification_tx_clone).await;
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
    pending: &Arc<
        Mutex<HashMap<i64, oneshot::Sender<Result<serde_json::Value, LspClientError>>>>,
    >,
    notification_tx: &mpsc::Sender<ServerNotification>,
) {
    if let Some(id) = message.get("id").and_then(|v| v.as_i64()) {
        let mut pending = pending.lock().await;
        if let Some(tx) = pending.remove(&id) {
            if let Some(error) = message.get("error") {
                let msg = error["message"].as_str().unwrap_or("unknown error");
                let _ = tx.send(Err(LspClientError::InvalidResponse(msg.to_string())));
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
) -> Result<(), anyhow::Error> {
    let id = *next_id;
    *next_id += 1;

    let params = serde_json::json!({
        "processId": std::process::id(),
        "rootUri": root_uri,
        "capabilities": capabilities
    });

    write_lsp_request(stdin, id, "initialize", params).await?;
    let response = read_lsp_message(stdout)
        .await?
        .ok_or_else(|| anyhow::anyhow!("LSP closed during init"))?;

    if response.get("error").is_some() {
        let err = response["error"]["message"]
            .as_str()
            .unwrap_or("unknown");
        return Err(anyhow::anyhow!("LSP initialize error: {}", err));
    }

    write_lsp_notification(stdin, "initialized", serde_json::json!({})).await?;
    Ok(())
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

    let content_length =
        content_length.ok_or_else(|| anyhow::anyhow!("Missing Content-Length"))?;
    let mut body = vec![0u8; content_length];
    reader.read_exact(&mut body).await?;
    let message: serde_json::Value = serde_json::from_slice(&body)?;
    Ok(Some(message))
}
