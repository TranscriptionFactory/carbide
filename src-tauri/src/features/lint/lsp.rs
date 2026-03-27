use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

use crate::shared::lsp_client::{
    LspClientConfig, LspSessionStatus, RestartableConfig, RestartableLspClient, ServerNotification,
};

use super::types::*;

pub struct LintLspSession {
    client: RestartableLspClient,
}

impl LintLspSession {
    pub async fn start(
        vault_id: String,
        vault_path: PathBuf,
        binary_path: PathBuf,
        browse_mode: bool,
        app: AppHandle,
    ) -> Result<Self, String> {
        let mut args = vec!["server".to_string()];
        if browse_mode {
            args.push("--no-config".to_string());
        } else {
            let config = super::config::config_path(&vault_path);
            if config.exists() {
                args.push("--config".to_string());
                args.push(config.to_string_lossy().into_owned());
            }
        }

        let root_uri = format!("file://{}", vault_path.display());
        let lsp_config = LspClientConfig {
            binary_path: binary_path.to_string_lossy().into_owned(),
            args,
            root_uri,
            capabilities: serde_json::json!({
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
            }),
            working_dir: Some(vault_path.to_string_lossy().into_owned()),
            request_timeout_ms: 15_000,
        };

        let mut client = RestartableLspClient::start(RestartableConfig::new(lsp_config))
            .await
            .map_err(|e| e.to_string())?;

        let notification_rx = client.take_notification_rx();
        let status_rx = client.take_status_rx();

        if let Some(rx) = notification_rx {
            let app_clone = app.clone();
            let vault_id_clone = vault_id.clone();
            let vault_path_clone = vault_path.clone();
            tokio::spawn(forward_notifications(
                rx,
                app_clone,
                vault_id_clone,
                vault_path_clone,
            ));
        }

        if let Some(rx) = status_rx {
            let app_clone = app.clone();
            let vault_id_clone = vault_id.clone();
            tokio::spawn(forward_status(rx, app_clone, vault_id_clone));
        }

        Ok(Self { client })
    }

    pub async fn send_request(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        self.client
            .send_request(method, params)
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn send_notification(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<(), String> {
        self.client
            .send_notification(method, params)
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn stop(self) {
        self.client.stop().await;
    }
}

async fn forward_status(
    mut rx: tokio::sync::mpsc::Receiver<LspSessionStatus>,
    app: AppHandle,
    vault_id: String,
) {
    while let Some(status) = rx.recv().await {
        let lint_status = match status {
            LspSessionStatus::Starting | LspSessionStatus::Restarting { .. } => {
                LintStatus::Starting
            }
            LspSessionStatus::Running => LintStatus::Running,
            LspSessionStatus::Stopped => LintStatus::Stopped,
            LspSessionStatus::Failed { message } => LintStatus::Error { message },
        };
        let _ = app.emit(
            "lint_event",
            LintEvent::StatusChanged {
                vault_id: vault_id.clone(),
                status: lint_status,
            },
        );
    }
}

async fn forward_notifications(
    mut rx: tokio::sync::mpsc::Receiver<ServerNotification>,
    app: AppHandle,
    vault_id: String,
    vault_path: PathBuf,
) {
    while let Some(notification) = rx.recv().await {
        if notification.method == "textDocument/publishDiagnostics" {
            handle_diagnostics(&notification.params, &app, &vault_id, &vault_path);
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
        if let Some(rel) = canon_abs
            .strip_prefix(vault_path)
            .ok()
            .map(|r| r.to_string_lossy().into_owned())
        {
            return rel;
        }
        if let Ok(canon_vault) = vault_path.canonicalize() {
            if let Some(rel) = canon_abs
                .strip_prefix(&canon_vault)
                .ok()
                .map(|r| r.to_string_lossy().into_owned())
            {
                return rel;
            }
        }
    }

    log::warn!(
        "Could not relativize diagnostic URI: {} against vault {:?}",
        uri,
        vault_path
    );
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

fn handle_diagnostics(
    params: &serde_json::Value,
    app: &AppHandle,
    vault_id: &str,
    vault_path: &Path,
) {
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
                        c.as_str()
                            .map(String::from)
                            .or_else(|| c.as_u64().map(|n| n.to_string()))
                    });

                    let fixable = d
                        .get("data")
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
