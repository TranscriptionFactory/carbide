use std::collections::HashMap;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use crate::shared::lsp_client::uri_utils;
use crate::shared::lsp_client::{
    LspSessionStatus, RestartableConfig, RestartableLspClient, ServerNotification,
};

use super::language_config::{build_lsp_config, ext_to_language_id, find_binary, find_server_spec};
use super::types::*;

struct LanguageSession {
    client: RestartableLspClient,
    open_files: Vec<String>,
}

pub struct CodeLspManager {
    vault_id: String,
    vault_path: PathBuf,
    sessions: HashMap<String, LanguageSession>,
    app: AppHandle,
}

impl CodeLspManager {
    pub fn new(vault_id: String, vault_path: PathBuf, app: AppHandle) -> Self {
        Self {
            vault_id,
            vault_path,
            sessions: HashMap::new(),
            app,
        }
    }

    pub async fn open_file(&mut self, rel_path: &str, content: &str) -> Result<(), String> {
        let ext = Path::new(rel_path)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("");

        let language_id = match ext_to_language_id(ext) {
            Some(id) => id,
            None => return Ok(()),
        };

        if !self.sessions.contains_key(language_id) {
            if let Err(e) = self.start_server(language_id).await {
                log::info!("code_lsp: no server for {language_id}: {e}");
                return Ok(());
            }
        }

        let uri = self.file_uri(rel_path);
        let session = match self.sessions.get_mut(language_id) {
            Some(s) => s,
            None => return Ok(()),
        };

        session
            .client
            .send_notification(
                "textDocument/didOpen",
                serde_json::json!({
                    "textDocument": {
                        "uri": uri,
                        "languageId": language_id,
                        "version": 1,
                        "text": content,
                    }
                }),
            )
            .await
            .map_err(|e| e.to_string())?;

        if !session.open_files.contains(&rel_path.to_string()) {
            session.open_files.push(rel_path.to_string());
        }
        Ok(())
    }

    pub async fn close_file(&mut self, rel_path: &str) -> Result<(), String> {
        let ext = Path::new(rel_path)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("");

        let language_id = match ext_to_language_id(ext) {
            Some(id) => id,
            None => return Ok(()),
        };

        let uri = self.file_uri(rel_path);
        let should_stop = if let Some(session) = self.sessions.get_mut(language_id) {
            let _ = session
                .client
                .send_notification(
                    "textDocument/didClose",
                    serde_json::json!({
                        "textDocument": { "uri": uri }
                    }),
                )
                .await;

            session.open_files.retain(|p| p != rel_path);
            session.open_files.is_empty()
        } else {
            false
        };

        if should_stop {
            self.stop_server(language_id).await;
        }

        Ok(())
    }

    async fn start_server(&mut self, language_id: &str) -> Result<(), String> {
        let spec = find_server_spec(language_id)
            .ok_or_else(|| format!("No server config for {language_id}"))?;

        let binary_path = find_binary(spec.binary_name)
            .ok_or_else(|| format!("{} not found on PATH", spec.binary_name))?;

        log::info!(
            "code_lsp: starting {} ({}) for vault {}",
            language_id,
            binary_path.display(),
            self.vault_id
        );

        let root_uri = format!("file://{}", self.vault_path.display());
        let lsp_config = build_lsp_config(
            spec,
            &binary_path,
            &root_uri,
            &self.vault_path.to_string_lossy(),
        );

        let mut client = RestartableLspClient::start(RestartableConfig::new(lsp_config))
            .await
            .map_err(|e| e.to_string())?;

        if let Some(rx) = client.take_notification_rx() {
            let app = self.app.clone();
            let vid = self.vault_id.clone();
            let lang = language_id.to_string();
            let vpath = self.vault_path.clone();
            tokio::spawn(forward_notifications(rx, app, vid, lang, vpath));
        }

        if let Some(rx) = client.take_status_rx() {
            let app = self.app.clone();
            let vid = self.vault_id.clone();
            let lang = language_id.to_string();
            tokio::spawn(forward_status(rx, app, vid, lang));
        }

        let _ = self.app.emit(
            "code_lsp_event",
            CodeLspEvent::ServerStatusChanged {
                vault_id: self.vault_id.clone(),
                language: language_id.to_string(),
                status: CodeLspStatus::Starting,
            },
        );

        self.sessions.insert(
            language_id.to_string(),
            LanguageSession {
                client,
                open_files: Vec::new(),
            },
        );

        Ok(())
    }

    async fn stop_server(&mut self, language_id: &str) {
        if let Some(session) = self.sessions.remove(language_id) {
            log::info!(
                "code_lsp: stopping {} for vault {}",
                language_id,
                self.vault_id
            );
            session.client.stop().await;
            let _ = self.app.emit(
                "code_lsp_event",
                CodeLspEvent::ServerStatusChanged {
                    vault_id: self.vault_id.clone(),
                    language: language_id.to_string(),
                    status: CodeLspStatus::Stopped,
                },
            );
        }
    }

    pub async fn stop_all(&mut self) {
        let languages: Vec<String> = self.sessions.keys().cloned().collect();
        for lang in languages {
            self.stop_server(&lang).await;
        }
    }

    fn file_uri(&self, rel_path: &str) -> String {
        let abs = self.vault_path.join(rel_path);
        format!("file://{}", abs.display())
    }
}

async fn forward_status(
    mut rx: mpsc::Receiver<LspSessionStatus>,
    app: AppHandle,
    vault_id: String,
    language: String,
) {
    while let Some(status) = rx.recv().await {
        let code_status = match status {
            LspSessionStatus::Starting | LspSessionStatus::Restarting { .. } => {
                CodeLspStatus::Starting
            }
            LspSessionStatus::Running => CodeLspStatus::Running,
            LspSessionStatus::Stopped => CodeLspStatus::Stopped,
            LspSessionStatus::Failed { message } => CodeLspStatus::Error { message },
        };
        let _ = app.emit(
            "code_lsp_event",
            CodeLspEvent::ServerStatusChanged {
                vault_id: vault_id.clone(),
                language: language.clone(),
                status: code_status,
            },
        );
    }
}

async fn forward_notifications(
    mut rx: mpsc::Receiver<ServerNotification>,
    app: AppHandle,
    vault_id: String,
    language: String,
    vault_path: PathBuf,
) {
    while let Some(notification) = rx.recv().await {
        if notification.method == "textDocument/publishDiagnostics" {
            handle_diagnostics(
                &notification.params,
                &app,
                &vault_id,
                &language,
                &vault_path,
            );
        }
    }
}

fn handle_diagnostics(
    params: &serde_json::Value,
    app: &AppHandle,
    vault_id: &str,
    language: &str,
    vault_path: &Path,
) {
    let uri = params["uri"].as_str().unwrap_or("");
    let rel_path = uri_utils::uri_to_relative_path(uri, vault_path);

    let diagnostics: Vec<CodeDiagnostic> = params["diagnostics"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|d| parse_diagnostic(d)).collect())
        .unwrap_or_default();

    let _ = app.emit(
        "code_lsp_event",
        CodeLspEvent::DiagnosticsUpdated {
            vault_id: vault_id.to_string(),
            language: language.to_string(),
            path: rel_path,
            diagnostics,
        },
    );
}

fn parse_diagnostic(d: &serde_json::Value) -> Option<CodeDiagnostic> {
    let range = &d["range"];
    let start = &range["start"];
    let end = &range["end"];

    Some(CodeDiagnostic {
        line: start["line"].as_u64()? as u32 + 1,
        column: start["character"].as_u64()? as u32 + 1,
        end_line: end["line"].as_u64()? as u32 + 1,
        end_column: end["character"].as_u64()? as u32 + 1,
        severity: match d["severity"].as_u64().unwrap_or(1) {
            1 => CodeDiagnosticSeverity::Error,
            2 => CodeDiagnosticSeverity::Warning,
            3 => CodeDiagnosticSeverity::Info,
            _ => CodeDiagnosticSeverity::Hint,
        },
        message: d["message"].as_str().unwrap_or("").to_string(),
        source: d["source"].as_str().map(|s| s.to_string()),
        code: d["code"]
            .as_str()
            .map(|s| s.to_string())
            .or_else(|| d["code"].as_u64().map(|n| n.to_string())),
    })
}

