use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot, Mutex};
use tauri::{AppHandle, Emitter};

use super::types::*;

const TARGET_TRIPLE: &str = env!("TARGET_TRIPLE");
const MAX_RESTART_COUNT: u32 = 3;
const RESTART_DELAYS_MS: [u64; 3] = [1000, 2000, 4000];

pub struct LspClient {
    request_tx: mpsc::Sender<LspOutgoing>,
    stop_tx: Option<oneshot::Sender<()>>,
    join_handle: Option<tokio::task::JoinHandle<()>>,
}

enum LspOutgoing {
    Request {
        method: String,
        params: serde_json::Value,
        response_tx: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    Notification {
        method: String,
        params: serde_json::Value,
    },
}

impl LspClient {
    pub async fn start(
        vault_id: String,
        vault_path: PathBuf,
        app: AppHandle,
    ) -> Result<Self, anyhow::Error> {
        let binary_path = resolve_sidecar_path("binaries/rumdl")?;
        let (request_tx, request_rx) = mpsc::channel::<LspOutgoing>(64);
        let (stop_tx, stop_rx) = oneshot::channel::<()>();

        let join_handle = tokio::spawn(lsp_run_loop(
            binary_path,
            vault_id,
            vault_path,
            app,
            request_rx,
            stop_rx,
        ));

        Ok(Self {
            request_tx,
            stop_tx: Some(stop_tx),
            join_handle: Some(join_handle),
        })
    }

    pub async fn send_notification(&self, method: &str, params: serde_json::Value) -> Result<(), String> {
        self.request_tx
            .send(LspOutgoing::Notification {
                method: method.to_string(),
                params,
            })
            .await
            .map_err(|_| "LSP client channel closed".to_string())
    }

    pub async fn send_request(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let (response_tx, response_rx) = oneshot::channel();
        self.request_tx
            .send(LspOutgoing::Request {
                method: method.to_string(),
                params,
                response_tx,
            })
            .await
            .map_err(|_| "LSP client channel closed".to_string())?;

        response_rx
            .await
            .map_err(|_| "LSP response channel dropped".to_string())?
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

pub fn resolve_sidecar_path(name: &str) -> Result<PathBuf, anyhow::Error> {
    let current_exe = std::env::current_exe()?;
    let exe_dir = current_exe
        .parent()
        .ok_or_else(|| anyhow::anyhow!("cannot determine executable directory"))?;

    let (with_triple, prod_name) = if cfg!(target_os = "windows") {
        (format!("{name}-{TARGET_TRIPLE}.exe"), format!("{name}.exe"))
    } else {
        (format!("{name}-{TARGET_TRIPLE}"), name.to_string())
    };

    // Production: next to the bundled executable
    let prod_path = exe_dir.join(&prod_name);
    if prod_path.exists() {
        return Ok(prod_path);
    }

    // Dev: next to the cargo target binary (target/debug/binaries/...)
    let dev_path = exe_dir.join(&with_triple);
    if dev_path.exists() {
        return Ok(dev_path);
    }

    // Dev fallback: relative to the Cargo manifest (src-tauri/binaries/...)
    const MANIFEST_DIR: &str = env!("CARGO_MANIFEST_DIR");
    let source_path = PathBuf::from(MANIFEST_DIR).join(&with_triple);
    if source_path.exists() {
        return Ok(source_path);
    }

    Err(anyhow::anyhow!(
        "rumdl binary not found at {}, {}, or {}",
        prod_path.display(),
        dev_path.display(),
        source_path.display()
    ))
}

async fn lsp_run_loop(
    binary_path: PathBuf,
    vault_id: String,
    vault_path: PathBuf,
    app: AppHandle,
    mut request_rx: mpsc::Receiver<LspOutgoing>,
    mut stop_rx: oneshot::Receiver<()>,
) {
    let mut restart_count: u32 = 0;

    loop {
        emit_status(&app, &vault_id, LintStatus::Starting);

        let spawn_result = spawn_lsp_process(&binary_path, &vault_path).await;
        let mut child = match spawn_result {
            Ok(c) => c,
            Err(e) => {
                log::error!("Failed to spawn rumdl: {}", e);
                emit_status(&app, &vault_id, LintStatus::Error { message: e.to_string() });
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
                log::debug!("[rumdl stderr] {}", line.trim());
                line.clear();
            }
        });

        let mut next_id: i64 = 1;
        let init_result = lsp_initialize(&stdin, &mut stdout_reader, &mut next_id, &vault_path).await;
        if let Err(e) = init_result {
            log::error!("LSP initialization failed: {}", e);
            let _ = child.kill().await;
            emit_status(&app, &vault_id, LintStatus::Error { message: e.to_string() });

            if restart_count < MAX_RESTART_COUNT {
                let delay = RESTART_DELAYS_MS[restart_count as usize];
                log::info!("Restarting rumdl in {}ms (attempt {})", delay, restart_count + 1);
                tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
                restart_count += 1;
                continue;
            }
            return;
        }

        emit_status(&app, &vault_id, LintStatus::Running);
        restart_count = 0;

        let pending: Arc<Mutex<HashMap<i64, oneshot::Sender<Result<serde_json::Value, String>>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let pending_clone = pending.clone();
        let app_clone = app.clone();
        let vault_id_clone = vault_id.clone();
        let vault_path_clone = vault_path.clone();
        let (reader_stop_tx, mut reader_stop_rx) = oneshot::channel::<()>();

        let reader_handle = tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut reader_stop_rx => break,
                    msg = read_lsp_message(&mut stdout_reader) => {
                        match msg {
                            Ok(Some(message)) => {
                                handle_incoming_message(
                                    message,
                                    &pending_clone,
                                    &app_clone,
                                    &vault_id_clone,
                                    &vault_path_clone,
                                ).await;
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

        let terminated = loop {
            tokio::select! {
                _ = &mut stop_rx => {
                    let _ = lsp_shutdown(&stdin, &mut next_id).await;
                    let _ = child.kill().await;
                    break true;
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
                                    let _ = tx.send(Err(e.to_string()));
                                }
                            }
                        }
                        Some(LspOutgoing::Notification { method, params }) => {
                            if let Err(e) = write_lsp_notification(&stdin, &method, params).await {
                                log::error!("Failed to write LSP notification: {}", e);
                            }
                        }
                        None => break true,
                    }
                }
                status = child.wait() => {
                    match status {
                        Ok(s) => log::warn!("rumdl process exited: {}", s),
                        Err(e) => log::error!("rumdl process error: {}", e),
                    }
                    break false;
                }
            }
        };

        let _ = reader_stop_tx.send(());
        let _ = reader_handle.await;
        let _ = stderr_handle.await;

        let mut pending_guard = pending.lock().await;
        for (_, tx) in pending_guard.drain() {
            let _ = tx.send(Err("LSP process terminated".to_string()));
        }
        drop(pending_guard);

        if terminated {
            emit_status(&app, &vault_id, LintStatus::Stopped);
            return;
        }

        if restart_count < MAX_RESTART_COUNT {
            let delay = RESTART_DELAYS_MS[restart_count as usize];
            log::info!("rumdl crashed, restarting in {}ms (attempt {})", delay, restart_count + 1);
            emit_status(&app, &vault_id, LintStatus::Error {
                message: format!("Process crashed, restarting (attempt {})", restart_count + 1),
            });
            tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
            restart_count += 1;
        } else {
            log::error!("rumdl exceeded max restart attempts");
            emit_status(&app, &vault_id, LintStatus::Error {
                message: "Process crashed repeatedly, giving up".to_string(),
            });
            return;
        }
    }
}

fn emit_status(app: &AppHandle, vault_id: &str, status: LintStatus) {
    let _ = app.emit("lint_event", LintEvent::StatusChanged {
        vault_id: vault_id.to_string(),
        status,
    });
}

async fn spawn_lsp_process(binary_path: &Path, vault_path: &Path) -> Result<Child, anyhow::Error> {
    let child = Command::new(binary_path)
        .args(["server"])
        .current_dir(vault_path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;
    Ok(child)
}

async fn lsp_initialize(
    stdin: &Arc<Mutex<tokio::process::ChildStdin>>,
    stdout: &mut BufReader<tokio::process::ChildStdout>,
    next_id: &mut i64,
    root_path: &Path,
) -> Result<(), anyhow::Error> {
    let id = *next_id;
    *next_id += 1;

    let root_uri = format!("file://{}", root_path.display());
    let params = serde_json::json!({
        "processId": std::process::id(),
        "rootUri": root_uri,
        "capabilities": {
            "textDocument": {
                "synchronization": {
                    "didSave": true,
                    "dynamicRegistration": false
                },
                "formatting": {
                    "dynamicRegistration": false
                },
                "publishDiagnostics": {
                    "relatedInformation": false
                },
                "codeAction": {
                    "dynamicRegistration": false,
                    "codeActionLiteralSupport": {
                        "codeActionKind": {
                            "valueSet": ["quickfix"]
                        }
                    }
                }
            }
        }
    });

    write_lsp_request(stdin, id, "initialize", params).await?;

    let response = read_lsp_message(stdout).await?
        .ok_or_else(|| anyhow::anyhow!("LSP server closed during initialization"))?;

    if response.get("error").is_some() {
        let err = response["error"]["message"]
            .as_str()
            .unwrap_or("unknown error");
        return Err(anyhow::anyhow!("LSP initialize failed: {}", err));
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
    let message = serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params,
    });
    write_lsp_message(stdin, &message).await
}

async fn write_lsp_notification(
    stdin: &Arc<Mutex<tokio::process::ChildStdin>>,
    method: &str,
    params: serde_json::Value,
) -> Result<(), anyhow::Error> {
    let message = serde_json::json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
    });
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

    let content_length = content_length
        .ok_or_else(|| anyhow::anyhow!("Missing Content-Length header"))?;

    let mut body = vec![0u8; content_length];
    reader.read_exact(&mut body).await?;

    let message: serde_json::Value = serde_json::from_slice(&body)?;
    Ok(Some(message))
}

async fn handle_incoming_message(
    message: serde_json::Value,
    pending: &Arc<Mutex<HashMap<i64, oneshot::Sender<Result<serde_json::Value, String>>>>>,
    app: &AppHandle,
    vault_id: &str,
    vault_path: &Path,
) {
    if let Some(id) = message.get("id").and_then(|v| v.as_i64()) {
        let mut pending = pending.lock().await;
        if let Some(tx) = pending.remove(&id) {
            if let Some(error) = message.get("error") {
                let msg = error["message"].as_str().unwrap_or("unknown error");
                let _ = tx.send(Err(msg.to_string()));
            } else {
                let result = message.get("result").cloned().unwrap_or(serde_json::Value::Null);
                let _ = tx.send(Ok(result));
            }
        }
        return;
    }

    let method = message.get("method").and_then(|v| v.as_str()).unwrap_or("");
    match method {
        "textDocument/publishDiagnostics" => {
            if let Some(params) = message.get("params") {
                handle_diagnostics(params, app, vault_id, vault_path);
            }
        }
        _ => {
            log::debug!("Unhandled LSP notification: {}", method);
        }
    }
}

fn uri_to_relative_path(uri: &str, vault_path: &Path) -> String {
    let raw = uri.strip_prefix("file://").unwrap_or(uri);

    let decoded = percent_decode(raw);
    let abs = Path::new(&decoded);

    let try_strip = |base: &Path| -> Option<String> {
        abs.strip_prefix(base)
            .ok()
            .map(|rel| rel.to_string_lossy().into_owned())
    };

    if let Some(rel) = try_strip(vault_path) {
        return rel;
    }

    if let Ok(canon_vault) = vault_path.canonicalize() {
        if let Some(rel) = try_strip(&canon_vault) {
            return rel;
        }
    }

    if let Ok(canon_abs) = abs.canonicalize() {
        if let Some(rel) = canon_abs.strip_prefix(vault_path).ok()
            .map(|r| r.to_string_lossy().into_owned()) {
            return rel;
        }
        if let Ok(canon_vault) = vault_path.canonicalize() {
            if let Some(rel) = canon_abs.strip_prefix(&canon_vault).ok()
                .map(|r| r.to_string_lossy().into_owned()) {
                return rel;
            }
        }
    }

    log::warn!("Could not relativize diagnostic URI: {} against vault {:?}", uri, vault_path);
    decoded
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                out.push(hi << 4 | lo);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| input.to_string())
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

fn handle_diagnostics(params: &serde_json::Value, app: &AppHandle, vault_id: &str, vault_path: &Path) {
    let uri = params["uri"].as_str().unwrap_or("");
    let path = uri_to_relative_path(uri, vault_path);

    let diagnostics: Vec<LintDiagnostic> = params["diagnostics"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|d| {
                    let range = &d["range"];
                    let start = &range["start"];
                    let end = &range["end"];
                    let severity = match d["severity"].as_u64() {
                        Some(1) => LintSeverity::Error,
                        Some(2) => LintSeverity::Warning,
                        Some(3) => LintSeverity::Info,
                        Some(4) => LintSeverity::Hint,
                        _ => LintSeverity::Warning,
                    };

                    let code = d.get("code").and_then(|c| {
                        c.as_str().map(String::from).or_else(|| c.as_u64().map(|n| n.to_string()))
                    });

                    let fixable = d.get("data")
                        .and_then(|data| data.get("fixable"))
                        .and_then(|f| f.as_bool())
                        .unwrap_or(false);

                    LintDiagnostic {
                        line: start["line"].as_u64().unwrap_or(0) as u32 + 1,
                        column: start["character"].as_u64().unwrap_or(0) as u32 + 1,
                        end_line: end["line"].as_u64().unwrap_or(0) as u32 + 1,
                        end_column: end["character"].as_u64().unwrap_or(0) as u32 + 1,
                        severity,
                        message: d["message"].as_str().unwrap_or("").to_string(),
                        rule_id: code,
                        fixable,
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    let _ = app.emit(
        "lint_event",
        LintEvent::DiagnosticsUpdated {
            vault_id: vault_id.to_string(),
            path: path.to_string(),
            diagnostics,
        },
    );
}
