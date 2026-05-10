use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot, Mutex};

use super::types::{ExternalMcpConfig, ExternalMcpError};
use crate::features::pipeline::service::get_expanded_path;

const INIT_TIMEOUT_MS: u64 = 30_000;
const REQUEST_TIMEOUT_MS: u64 = 120_000;

enum McpOutgoing {
    Request {
        method: String,
        params: serde_json::Value,
        response_tx: oneshot::Sender<Result<serde_json::Value, ExternalMcpError>>,
    },
    Notification {
        method: String,
        params: serde_json::Value,
    },
}

pub struct ExternalMcpClient {
    request_tx: mpsc::Sender<McpOutgoing>,
    stop_tx: Option<oneshot::Sender<()>>,
    join_handle: Option<tokio::task::JoinHandle<()>>,
    cached_tools: Vec<serde_json::Value>,
    request_timeout_ms: u64,
}

impl ExternalMcpClient {
    pub async fn start(config: ExternalMcpConfig) -> Result<Self, ExternalMcpError> {
        let (request_tx, request_rx) = mpsc::channel::<McpOutgoing>(64);
        let (stop_tx, stop_rx) = oneshot::channel::<()>();
        let (ready_tx, ready_rx) =
            oneshot::channel::<Result<Vec<serde_json::Value>, ExternalMcpError>>();

        let request_timeout_ms = config.request_timeout_ms;

        let join_handle = tokio::spawn(mcp_run_loop(config, request_rx, stop_rx, ready_tx));

        let cached_tools = ready_rx
            .await
            .map_err(|_| ExternalMcpError::ChannelClosed)??;

        Ok(Self {
            request_tx,
            stop_tx: Some(stop_tx),
            join_handle: Some(join_handle),
            cached_tools,
            request_timeout_ms,
        })
    }

    pub fn tool_count(&self) -> usize {
        self.cached_tools.len()
    }

    pub fn cached_tools(&self) -> &[serde_json::Value] {
        &self.cached_tools
    }

    pub async fn call_tool(
        &self,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> Result<serde_json::Value, ExternalMcpError> {
        self.send_request(
            "tools/call",
            serde_json::json!({ "name": tool_name, "arguments": arguments }),
        )
        .await
    }

    pub async fn list_tools(&self) -> Result<Vec<serde_json::Value>, ExternalMcpError> {
        let result = self
            .send_request("tools/list", serde_json::json!({}))
            .await?;
        let tools = result
            .get("tools")
            .and_then(|t| t.as_array())
            .cloned()
            .unwrap_or_default();
        Ok(tools)
    }

    pub fn is_alive(&self) -> bool {
        !self.request_tx.is_closed()
    }

    pub async fn stop(&mut self) {
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(());
        }
        if let Some(handle) = self.join_handle.take() {
            let _ = handle.await;
        }
    }

    async fn send_request(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, ExternalMcpError> {
        let (response_tx, response_rx) = oneshot::channel();
        self.request_tx
            .send(McpOutgoing::Request {
                method: method.to_string(),
                params,
                response_tx,
            })
            .await
            .map_err(|_| ExternalMcpError::ChannelClosed)?;

        tokio::time::timeout(
            std::time::Duration::from_millis(self.request_timeout_ms),
            response_rx,
        )
        .await
        .map_err(|_| ExternalMcpError::RequestTimeout)?
        .map_err(|_| ExternalMcpError::ChannelClosed)?
    }
}

async fn mcp_run_loop(
    config: ExternalMcpConfig,
    mut request_rx: mpsc::Receiver<McpOutgoing>,
    mut stop_rx: oneshot::Receiver<()>,
    ready_tx: oneshot::Sender<Result<Vec<serde_json::Value>, ExternalMcpError>>,
) {
    let mut cmd = Command::new(&config.binary);
    cmd.args(&config.args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    if !config.env_vars.iter().any(|(k, _)| k == "PATH") {
        cmd.env("PATH", get_expanded_path());
    }
    for (key, value) in &config.env_vars {
        cmd.env(key, value);
    }
    if let Some(dir) = &config.working_dir {
        cmd.current_dir(dir);
    }

    let mut child: Child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let _ = ready_tx.send(Err(ExternalMcpError::ProcessSpawnFailed(e.to_string())));
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
            log::warn!("[external_mcp stderr] {}", line.trim());
            line.clear();
        }
    });

    let mut next_id: i64 = 1;

    let init_timeout = config.init_timeout_ms;
    let tools = match mcp_initialize(&stdin, &mut stdout_reader, &mut next_id, init_timeout).await
    {
        Ok(tools) => tools,
        Err(e) => {
            log::error!("External MCP initialization failed: {}", e);
            let _ = ready_tx.send(Err(e));
            let _ = child.kill().await;
            return;
        }
    };
    let _ = ready_tx.send(Ok(tools));

    let pending: Arc<
        Mutex<HashMap<i64, oneshot::Sender<Result<serde_json::Value, ExternalMcpError>>>>,
    > = Arc::new(Mutex::new(HashMap::new()));

    let pending_clone = pending.clone();
    let (reader_stop_tx, mut reader_stop_rx) = oneshot::channel::<()>();

    let reader_handle = tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut reader_stop_rx => break,
                line = read_json_line(&mut stdout_reader) => {
                    match line {
                        Ok(Some(message)) => {
                            dispatch_response(message, &pending_clone).await;
                        }
                        Ok(None) => break,
                        Err(e) => {
                            log::error!("External MCP read error: {}", e);
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
                let _ = write_json_line(&stdin, &serde_json::json!({
                    "jsonrpc": "2.0",
                    "method": "notifications/cancelled",
                    "params": {}
                })).await;
                let _ = child.kill().await;
                break;
            }
            msg = request_rx.recv() => {
                match msg {
                    Some(McpOutgoing::Request { method, params, response_tx }) => {
                        let id = next_id;
                        next_id += 1;
                        pending.lock().await.insert(id, response_tx);
                        if let Err(e) = write_json_line(&stdin, &serde_json::json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "method": method,
                            "params": params
                        })).await {
                            log::error!("Failed to write MCP request: {}", e);
                            if let Some(tx) = pending.lock().await.remove(&id) {
                                let _ = tx.send(Err(ExternalMcpError::InvalidResponse(e.to_string())));
                            }
                        }
                    }
                    Some(McpOutgoing::Notification { method, params }) => {
                        let _ = write_json_line(&stdin, &serde_json::json!({
                            "jsonrpc": "2.0",
                            "method": method,
                            "params": params
                        })).await;
                    }
                    None => break,
                }
            }
            status = child.wait() => {
                match status {
                    Ok(s) => log::warn!("External MCP process exited: {}", s),
                    Err(e) => log::error!("External MCP process error: {}", e),
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
        let _ = tx.send(Err(ExternalMcpError::ProcessExited));
    }
}

async fn mcp_initialize(
    stdin: &Arc<Mutex<tokio::process::ChildStdin>>,
    stdout: &mut BufReader<tokio::process::ChildStdout>,
    next_id: &mut i64,
    init_timeout_ms: u64,
) -> Result<Vec<serde_json::Value>, ExternalMcpError> {
    let id = *next_id;
    *next_id += 1;

    write_json_line(
        stdin,
        &serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "clientInfo": { "name": "carbide", "version": "1.0" },
                "capabilities": {}
            }
        }),
    )
    .await
    .map_err(|e| ExternalMcpError::InitFailed(e.to_string()))?;

    let response = tokio::time::timeout(
        std::time::Duration::from_millis(init_timeout_ms),
        read_json_line(stdout),
    )
    .await
    .map_err(|_| ExternalMcpError::InitTimeout)?
    .map_err(|e| ExternalMcpError::InitFailed(e.to_string()))?
    .ok_or_else(|| ExternalMcpError::InitFailed("process exited during init".to_string()))?;

    if let Some(error) = response.get("error") {
        let msg = error
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("unknown");
        return Err(ExternalMcpError::InitFailed(msg.to_string()));
    }

    write_json_line(
        stdin,
        &serde_json::json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }),
    )
    .await
    .map_err(|e| ExternalMcpError::InitFailed(e.to_string()))?;

    let tools_id = *next_id;
    *next_id += 1;

    write_json_line(
        stdin,
        &serde_json::json!({
            "jsonrpc": "2.0",
            "id": tools_id,
            "method": "tools/list",
            "params": {}
        }),
    )
    .await
    .map_err(|e| ExternalMcpError::InitFailed(e.to_string()))?;

    let tools_response = tokio::time::timeout(
        std::time::Duration::from_millis(init_timeout_ms),
        read_json_line(stdout),
    )
    .await
    .map_err(|_| ExternalMcpError::InitTimeout)?
    .map_err(|e| ExternalMcpError::InitFailed(e.to_string()))?
    .ok_or_else(|| ExternalMcpError::InitFailed("process exited during tools/list".to_string()))?;

    let tools = tools_response
        .get("result")
        .and_then(|r| r.get("tools"))
        .and_then(|t| t.as_array())
        .cloned()
        .unwrap_or_default();

    log::info!(
        "External MCP initialized with {} tools",
        tools.len()
    );

    Ok(tools)
}

async fn dispatch_response(
    message: serde_json::Value,
    pending: &Arc<
        Mutex<HashMap<i64, oneshot::Sender<Result<serde_json::Value, ExternalMcpError>>>>,
    >,
) {
    if let Some(id) = message.get("id").and_then(|v| v.as_i64()) {
        let mut pending = pending.lock().await;
        if let Some(tx) = pending.remove(&id) {
            if let Some(error) = message.get("error") {
                let msg = error
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or("unknown error");
                let _ = tx.send(Err(ExternalMcpError::InvalidResponse(msg.to_string())));
            } else {
                let result = message
                    .get("result")
                    .cloned()
                    .unwrap_or(serde_json::Value::Null);
                let _ = tx.send(Ok(result));
            }
        }
    }
}

async fn write_json_line(
    stdin: &Arc<Mutex<tokio::process::ChildStdin>>,
    message: &serde_json::Value,
) -> Result<(), anyhow::Error> {
    let mut line = serde_json::to_string(message)?;
    line.push('\n');
    let mut stdin = stdin.lock().await;
    stdin.write_all(line.as_bytes()).await?;
    stdin.flush().await?;
    Ok(())
}

async fn read_json_line(
    reader: &mut BufReader<tokio::process::ChildStdout>,
) -> Result<Option<serde_json::Value>, anyhow::Error> {
    let mut line = String::new();
    let bytes_read = reader.read_line(&mut line).await?;
    if bytes_read == 0 {
        return Ok(None);
    }
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let message: serde_json::Value = serde_json::from_str(trimmed)?;
    Ok(Some(message))
}
