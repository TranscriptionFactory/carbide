use crate::features::ai::service::AiProviderConfig;
use crate::shared::lsp_client::{
    forwarding, uri_utils, LspClientError, LspSessionStatus, RestartableConfig,
    RestartableLspClient, ServerNotification, ServerRequest,
};
use crate::shared::storage;
use crate::shared::vault_path;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;

use super::provider::resolve_markdown_lsp_startup;
use super::types::*;

pub struct MarkdownLspState {
    clients: Mutex<HashMap<String, RestartableLspClient>>,
    pending_workspace_edit: Arc<Mutex<Option<MarkdownLspWorkspaceEditResult>>>,
}

impl Default for MarkdownLspState {
    fn default() -> Self {
        Self {
            clients: Mutex::new(HashMap::new()),
            pending_workspace_edit: Arc::new(Mutex::new(None)),
        }
    }
}

impl MarkdownLspState {
    pub async fn shutdown(&self) {
        for (id, client) in self.clients.lock().await.drain() {
            log::info!("Stopping markdown LSP for vault {}", id);
            client.stop().await;
        }
    }

    async fn request(
        &self,
        vault_id: &str,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let clients = self.clients.lock().await;
        let client = clients
            .get(vault_id)
            .ok_or_else(|| format!("Markdown LSP not started for vault {}", vault_id))?;
        client.send_request(method, params).await.map_err(err)
    }

    async fn notify(
        &self,
        vault_id: &str,
        method: &str,
        params: serde_json::Value,
    ) -> Result<(), String> {
        let clients = self.clients.lock().await;
        let client = clients
            .get(vault_id)
            .ok_or_else(|| format!("Markdown LSP not started for vault {}", vault_id))?;
        client.send_notification(method, params).await.map_err(err)
    }
}

fn file_uri(vault_path: &std::path::Path, file_path: &str) -> String {
    uri_utils::file_uri(vault_path, file_path)
}

fn err(e: LspClientError) -> String {
    e.to_string()
}

fn text_document_identifier(uri: &str) -> serde_json::Value {
    serde_json::json!({ "uri": uri })
}

fn position(line: u32, character: u32) -> serde_json::Value {
    serde_json::json!({ "line": line, "character": character })
}

fn text_document_position(uri: &str, line: u32, character: u32) -> serde_json::Value {
    serde_json::json!({
        "textDocument": text_document_identifier(uri),
        "position": position(line, character)
    })
}

fn markdown_lsp_state(app: &AppHandle) -> tauri::State<'_, MarkdownLspState> {
    app.state::<MarkdownLspState>()
}

fn lsp_severity_to_string(severity: Option<u64>) -> String {
    forwarding::lsp_severity_to_string(severity).to_string()
}

fn parse_lsp_diagnostics(
    params: &serde_json::Value,
) -> Option<(String, Vec<MarkdownLspDiagnostic>)> {
    let uri = params.get("uri")?.as_str()?.to_string();
    let diags = params
        .get("diagnostics")?
        .as_array()?
        .iter()
        .filter_map(|d| {
            let range = d.get("range")?;
            let start = range.get("start")?;
            let end = range.get("end")?;
            Some(MarkdownLspDiagnostic {
                line: start.get("line")?.as_u64()? as u32,
                character: start.get("character")?.as_u64()? as u32,
                end_line: end.get("line")?.as_u64()? as u32,
                end_character: end.get("character")?.as_u64()? as u32,
                severity: lsp_severity_to_string(d.get("severity").and_then(|s| s.as_u64())),
                message: d.get("message")?.as_str()?.to_string(),
            })
        })
        .collect();
    Some((uri, diags))
}

fn spawn_notification_forwarder(
    app: AppHandle,
    vault_id: String,
    mut notification_rx: tokio::sync::mpsc::Receiver<ServerNotification>,
) {
    tokio::spawn(async move {
        while let Some(notification) = notification_rx.recv().await {
            if notification.method == "textDocument/publishDiagnostics" {
                if let Some((uri, diagnostics)) = parse_lsp_diagnostics(&notification.params) {
                    let _ = app.emit(
                        "markdown_lsp_event",
                        MarkdownLspEvent::DiagnosticsUpdated {
                            vault_id: vault_id.clone(),
                            uri,
                            diagnostics,
                        },
                    );
                }
            }
        }
    });
}

fn spawn_server_request_handler(
    vault_path: std::path::PathBuf,
    pending_workspace_edit: Arc<Mutex<Option<MarkdownLspWorkspaceEditResult>>>,
    mut server_request_rx: tokio::sync::mpsc::Receiver<ServerRequest>,
) {
    tokio::spawn(async move {
        while let Some(req) = server_request_rx.recv().await {
            if req.method == "workspace/applyEdit" {
                log::info!(
                    "workspace/applyEdit received, applying edits for vault {}",
                    vault_path.display()
                );
                let edit_param = &req.params;
                let edit = if let Some(e) = edit_param.get("edit") {
                    e
                } else {
                    edit_param
                };
                let result = apply_workspace_edit(&vault_path, edit).await;
                match &result {
                    Ok(r) => {
                        log::info!(
                            "workspace/applyEdit applied: created={} modified={} deleted={} errors={}",
                            r.files_created.len(),
                            r.files_modified.len(),
                            r.files_deleted.len(),
                            r.errors.len()
                        );
                        *pending_workspace_edit.lock().await = Some(r.clone());
                        let _ = req.response_tx.send(serde_json::json!({"applied": true}));
                    }
                    Err(e) => {
                        log::warn!("workspace/applyEdit failed: {}", e);
                        let _ = req
                            .response_tx
                            .send(serde_json::json!({"applied": false, "failureReason": e}));
                    }
                }
            } else {
                log::debug!("Unhandled server request: {}", req.method);
                let _ = req.response_tx.send(serde_json::Value::Null);
            }
        }
    });
}

fn map_lsp_session_status(status: &LspSessionStatus) -> MarkdownLspStatus {
    match status {
        LspSessionStatus::Starting => MarkdownLspStatus::Starting,
        LspSessionStatus::Running => MarkdownLspStatus::Running,
        LspSessionStatus::Restarting { attempt } => {
            MarkdownLspStatus::Restarting { attempt: *attempt }
        }
        LspSessionStatus::Stopped => MarkdownLspStatus::Stopped,
        LspSessionStatus::Failed { message } => MarkdownLspStatus::Failed {
            message: message.clone(),
        },
    }
}

fn spawn_status_forwarder(
    app: AppHandle,
    vault_id: String,
    mut status_rx: tokio::sync::mpsc::Receiver<LspSessionStatus>,
) {
    tokio::spawn(async move {
        while let Some(status) = status_rx.recv().await {
            let _ = app.emit(
                "markdown_lsp_event",
                MarkdownLspEvent::StatusChanged {
                    vault_id: vault_id.clone(),
                    status: map_lsp_session_status(&status),
                },
            );
        }
    });
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_lsp_start(
    app: AppHandle,
    vault_id: String,
    provider: Option<String>,
    custom_binary_path: Option<String>,
    startup_reason: Option<String>,
    initial_iwe_provider_config: Option<AiProviderConfig>,
) -> Result<MarkdownLspStartResult, String> {
    let startup_started_at = Instant::now();
    let vault_mode = storage::vault_mode_for_id(&app, &vault_id)?;
    if vault_mode == storage::VaultMode::Browse {
        return Err("Markdown LSP is only available in vault mode".to_string());
    }

    let vault_path = storage::vault_path(&app, &vault_id)?;
    let root_uri = tauri::Url::from_file_path(&vault_path)
        .map_err(|_| "invalid vault path for URI".to_string())?
        .to_string();

    let custom_ref = custom_binary_path.as_deref();
    let preferred = provider.as_deref().unwrap_or("iwes");
    let startup_reason = startup_reason.unwrap_or_else(|| "initial_start".to_string());
    let resolution_started_at = Instant::now();
    let startup = resolve_markdown_lsp_startup(&app, preferred, custom_ref, &vault_path).await?;
    log::info!(
        "markdown_lsp_startup phase=resolve_startup startup_reason={} requested_provider={} effective_provider={} duration_ms={}",
        startup_reason,
        preferred,
        startup.effective_provider.as_str(),
        resolution_started_at.elapsed().as_millis()
    );
    let effective_provider = startup.effective_provider;
    let lsp_provider = startup.lsp_provider;

    let pre_start_started_at = Instant::now();
    lsp_provider.on_pre_start(&app, &vault_path).await?;
    log::info!(
        "markdown_lsp_startup phase=on_pre_start startup_reason={} effective_provider={} duration_ms={}",
        startup_reason,
        effective_provider.as_str(),
        pre_start_started_at.elapsed().as_millis()
    );

    if matches!(effective_provider, MarkdownLspProvider::Iwes) {
        if let Some(provider_config) = initial_iwe_provider_config.as_ref() {
            let rewrite_started_at = Instant::now();
            iwe_config_rewrite_provider(app.clone(), vault_id.clone(), provider_config.clone())
                .await?;
            log::info!(
                "markdown_lsp_startup phase=initial_config_rewrite startup_reason={} provider={} duration_ms={}",
                startup_reason,
                provider_config.name,
                rewrite_started_at.elapsed().as_millis()
            );
        }
    }

    let working_dir = vault_path
        .to_str()
        .ok_or("invalid vault path encoding")?;
    let mut config = lsp_provider.build_config(&startup.binary_path, &root_uri, working_dir);

    let vault_risk = vault_path::analyze(&vault_path);
    if vault_risk.is_cloud_backed {
        log::warn!(
            "markdown_lsp_startup vault_path_risk=cloud_backed provider={}",
            vault_risk.cloud_provider.unwrap_or("unknown")
        );
        config.init_timeout_ms = 10_000;
    }

    // Stop existing client FIRST to avoid duplicate processes
    let state = markdown_lsp_state(&app);
    let old_client = state.clients.lock().await.remove(&vault_id);
    if let Some(old) = old_client {
        old.stop().await;
    }

    let spawn_started_at = Instant::now();
    let mut client = RestartableLspClient::start(RestartableConfig::new(config))
        .await
        .map_err(err)?;
    log::info!(
        "markdown_lsp_startup phase=lsp_initialize_completed startup_reason={} effective_provider={} duration_ms={}",
        startup_reason,
        effective_provider.as_str(),
        spawn_started_at.elapsed().as_millis()
    );

    let trigger_characters = effective_provider.completion_trigger_characters();

    if let Some(rx) = client.take_notification_rx() {
        spawn_notification_forwarder(app.clone(), vault_id.clone(), rx);
    }

    if lsp_provider.supports_workspace_edit() {
        if let Some(rx) = client.take_server_request_rx() {
            spawn_server_request_handler(
                vault_path.clone(),
                state.pending_workspace_edit.clone(),
                rx,
            );
        }
    }

    if let Some(rx) = client.take_status_rx() {
        spawn_status_forwarder(app.clone(), vault_id.clone(), rx);
    }

    state.clients.lock().await.insert(vault_id, client);
    log::info!(
        "markdown_lsp_startup phase=complete startup_reason={} effective_provider={} total_duration_ms={}",
        startup_reason,
        effective_provider.as_str(),
        startup_started_at.elapsed().as_millis()
    );
    Ok(MarkdownLspStartResult {
        completion_trigger_characters: trigger_characters,
        effective_provider,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_lsp_stop(app: AppHandle, vault_id: String) -> Result<(), String> {
    let state = markdown_lsp_state(&app);
    if let Some(client) = state.clients.lock().await.remove(&vault_id) {
        client.stop().await;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_lsp_did_open(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    content: String,
) -> Result<(), String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    markdown_lsp_state(&app)
        .notify(
            &vault_id,
            "textDocument/didOpen",
            serde_json::json!({
                "textDocument": {
                    "uri": uri,
                    "languageId": "markdown",
                    "version": 1,
                    "text": content
                }
            }),
        )
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_lsp_did_change(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    version: i32,
    content: String,
) -> Result<(), String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    markdown_lsp_state(&app)
        .notify(
            &vault_id,
            "textDocument/didChange",
            serde_json::json!({
                "textDocument": { "uri": uri, "version": version },
                "contentChanges": [{ "text": content }]
            }),
        )
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_lsp_did_save(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    content: String,
) -> Result<(), String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    markdown_lsp_state(&app)
        .notify(
            &vault_id,
            "textDocument/didSave",
            serde_json::json!({
                "textDocument": { "uri": uri },
                "text": content
            }),
        )
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_lsp_did_close(
    app: AppHandle,
    vault_id: String,
    file_path: String,
) -> Result<(), String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    markdown_lsp_state(&app)
        .notify(
            &vault_id,
            "textDocument/didClose",
            serde_json::json!({
                "textDocument": { "uri": uri }
            }),
        )
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_lsp_hover(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<MarkdownLspHoverResult, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    let result = markdown_lsp_state(&app)
        .request(
            &vault_id,
            "textDocument/hover",
            text_document_position(&uri, line, character),
        )
        .await?;

    let contents = result
        .get("contents")
        .and_then(|c| c.get("value"))
        .and_then(|v| v.as_str())
        .map(String::from);

    Ok(MarkdownLspHoverResult { contents })
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_lsp_references(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<Vec<MarkdownLspLocation>, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    let result = markdown_lsp_state(&app)
        .request(
            &vault_id,
            "textDocument/references",
            serde_json::json!({
                "textDocument": text_document_identifier(&uri),
                "position": position(line, character),
                "context": { "includeDeclaration": true }
            }),
        )
        .await?;

    parse_locations(&result)
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_lsp_definition(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<Vec<MarkdownLspLocation>, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    let result = markdown_lsp_state(&app)
        .request(
            &vault_id,
            "textDocument/definition",
            text_document_position(&uri, line, character),
        )
        .await?;

    parse_locations(&result)
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_lsp_code_actions(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    start_line: u32,
    start_character: u32,
    end_line: u32,
    end_character: u32,
) -> Result<Vec<MarkdownLspCodeAction>, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    let result = markdown_lsp_state(&app)
        .request(
            &vault_id,
            "textDocument/codeAction",
            serde_json::json!({
                "textDocument": text_document_identifier(&uri),
                "range": {
                    "start": position(start_line, start_character),
                    "end": position(end_line, end_character)
                },
                "context": { "diagnostics": [] }
            }),
        )
        .await?;

    let actions = result
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|a| {
            Some(MarkdownLspCodeAction {
                title: a.get("title")?.as_str()?.to_string(),
                kind: a.get("kind").and_then(|k| k.as_str()).map(String::from),
                data: a.get("data").map(|d| d.to_string()),
                raw_json: a.to_string(),
            })
        })
        .collect();

    Ok(actions)
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_lsp_code_action_resolve(
    app: AppHandle,
    vault_id: String,
    code_action_json: String,
) -> Result<MarkdownLspWorkspaceEditResult, String> {
    let state = markdown_lsp_state(&app);
    *state.pending_workspace_edit.lock().await = None;

    let parsed: serde_json::Value =
        serde_json::from_str(&code_action_json).map_err(|e| e.to_string())?;

    // If the code action already contains an edit, apply it directly
    // (server returned a fully-resolved action or doesn't support codeAction/resolve)
    if let Some(edit) = parsed.get("edit") {
        log::info!("code_action_resolve: action already has edit, applying directly");
        let vault_path = storage::vault_path(&app, &vault_id)?;
        return apply_workspace_edit(&vault_path, edit).await;
    }

    let result = markdown_lsp_state(&app)
        .request(&vault_id, "codeAction/resolve", parsed)
        .await?;

    if let Some(pending) = state.pending_workspace_edit.lock().await.take() {
        log::info!("code_action_resolve: using workspace/applyEdit result (already applied)");
        return Ok(pending);
    }

    let vault_path = storage::vault_path(&app, &vault_id)?;
    apply_workspace_edit(&vault_path, &result).await
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_lsp_workspace_symbols(
    app: AppHandle,
    vault_id: String,
    query: String,
) -> Result<Vec<MarkdownLspSymbol>, String> {
    let result = markdown_lsp_state(&app)
        .request(
            &vault_id,
            "workspace/symbol",
            serde_json::json!({ "query": query }),
        )
        .await?;

    let symbols = result
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|s| {
            let loc = s.get("location")?;
            Some(MarkdownLspSymbol {
                name: s.get("name")?.as_str()?.to_string(),
                kind: s.get("kind")?.as_u64()? as u32,
                location: parse_location_obj(loc)?,
            })
        })
        .collect();

    Ok(symbols)
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_lsp_rename(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    line: u32,
    character: u32,
    new_name: String,
) -> Result<MarkdownLspWorkspaceEditResult, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    let result = markdown_lsp_state(&app)
        .request(
            &vault_id,
            "textDocument/rename",
            serde_json::json!({
                "textDocument": text_document_identifier(&uri),
                "position": position(line, character),
                "newName": new_name
            }),
        )
        .await?;

    apply_workspace_edit(&vault_path, &result).await
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_lsp_prepare_rename(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<Option<MarkdownLspPrepareRenameResult>, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    let result = markdown_lsp_state(&app)
        .request(
            &vault_id,
            "textDocument/prepareRename",
            text_document_position(&uri, line, character),
        )
        .await?;

    if result.is_null() {
        return Ok(None);
    }

    let range = result
        .get("range")
        .and_then(parse_range_obj)
        .ok_or("invalid prepareRename response")?;
    let placeholder = result
        .get("placeholder")
        .and_then(|p| p.as_str())
        .unwrap_or("")
        .to_string();

    Ok(Some(MarkdownLspPrepareRenameResult { range, placeholder }))
}

fn normalize_completion_item(item: &serde_json::Value) -> Option<MarkdownLspCompletionItem> {
    let raw_label = item.get("label")?.as_str()?.to_string();
    let title_part = raw_label.trim().trim_start_matches("🔗").trim();
    let raw_insert = item
        .get("insertText")
        .and_then(|t| t.as_str())
        .map(String::from);
    let (label, insert_text) = if title_part.is_empty() {
        let fallback = label_from_insert_text(item)?;
        let fixed_insert = raw_insert.map(|t| {
            if t.starts_with("[](") {
                format!("[{}]({}", &fallback, &t[3..])
            } else {
                t
            }
        });
        (fallback, fixed_insert)
    } else {
        (raw_label, raw_insert)
    };
    Some(MarkdownLspCompletionItem {
        label,
        detail: item
            .get("detail")
            .and_then(|d| d.as_str())
            .map(String::from),
        insert_text,
    })
}

fn label_from_insert_text(item: &serde_json::Value) -> Option<String> {
    let text = item.get("insertText")?.as_str()?;
    let dest = text
        .find("](")
        .and_then(|start| {
            let rest = &text[start + 2..];
            rest.find(')').map(|end| &rest[..end])
        })
        .unwrap_or(text);
    let segment = dest.rsplit('/').next().unwrap_or(dest);
    let segment = segment.strip_suffix(".md").unwrap_or(segment);
    let decoded = percent_decode(segment);
    let label = decoded.trim().to_string();
    if label.is_empty() {
        return None;
    }
    Some(label)
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_lsp_completion(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<Vec<MarkdownLspCompletionItem>, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    log::trace!("Marksman completion request uri={}", uri);
    let result = markdown_lsp_state(&app)
        .request(
            &vault_id,
            "textDocument/completion",
            text_document_position(&uri, line, character),
        )
        .await?;

    let items_val = if result.get("items").is_some() {
        result.get("items")
    } else if result.is_array() {
        Some(&result)
    } else {
        None
    };

    let empty_vec = vec![];
    let raw_items = items_val.and_then(|v| v.as_array()).unwrap_or(&empty_vec);
    for item in raw_items.iter() {
        log::trace!(
            "Marksman completion item: label={:?} insertText={:?} detail={:?}",
            item.get("label").and_then(|v| v.as_str()),
            item.get("insertText").and_then(|v| v.as_str()),
            item.get("detail").and_then(|v| v.as_str()),
        );
    }
    let items = raw_items
        .iter()
        .filter_map(normalize_completion_item)
        .collect();

    Ok(items)
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_lsp_formatting(
    app: AppHandle,
    vault_id: String,
    file_path: String,
) -> Result<Vec<MarkdownLspTextEdit>, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    let result = markdown_lsp_state(&app)
        .request(
            &vault_id,
            "textDocument/formatting",
            serde_json::json!({
                "textDocument": text_document_identifier(&uri),
                "options": { "tabSize": 4, "insertSpaces": true }
            }),
        )
        .await?;

    let edits = result
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|edit| {
            let range = parse_range_obj(edit.get("range")?)?;
            Some(MarkdownLspTextEdit {
                range,
                new_text: edit.get("newText")?.as_str()?.replace('\t', "    "),
            })
        })
        .collect();

    Ok(edits)
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_lsp_inlay_hints(
    app: AppHandle,
    vault_id: String,
    file_path: String,
) -> Result<Vec<MarkdownLspInlayHint>, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    let result = markdown_lsp_state(&app)
        .request(
            &vault_id,
            "textDocument/inlayHint",
            serde_json::json!({
                "textDocument": text_document_identifier(&uri),
                "range": {
                    "start": position(0, 0),
                    "end": position(u32::MAX, 0)
                }
            }),
        )
        .await?;

    let hints = result
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|hint| {
            let pos = hint.get("position")?;
            let label = if let Some(s) = hint.get("label").and_then(|l| l.as_str()) {
                s.to_string()
            } else if let Some(parts) = hint.get("label").and_then(|l| l.as_array()) {
                parts
                    .iter()
                    .filter_map(|p| p.get("value").and_then(|v| v.as_str()))
                    .collect::<Vec<_>>()
                    .join("")
            } else {
                return None;
            };
            Some(MarkdownLspInlayHint {
                position_line: pos.get("line")?.as_u64()? as u32,
                position_character: pos.get("character")?.as_u64()? as u32,
                label,
            })
        })
        .collect();

    Ok(hints)
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_lsp_document_symbols(
    app: AppHandle,
    vault_id: String,
    file_path: String,
) -> Result<Vec<MarkdownLspDocumentSymbol>, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    let result = markdown_lsp_state(&app)
        .request(
            &vault_id,
            "textDocument/documentSymbol",
            serde_json::json!({
                "textDocument": text_document_identifier(&uri)
            }),
        )
        .await?;

    let symbols = result
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|s| {
            let loc = s.get("location")?;
            Some(MarkdownLspDocumentSymbol {
                name: s.get("name")?.as_str()?.to_string(),
                kind: s.get("kind")?.as_u64()? as u32,
                container_name: s
                    .get("containerName")
                    .and_then(|c| c.as_str())
                    .map(String::from),
                location: parse_location_obj(loc)?,
            })
        })
        .collect();

    Ok(symbols)
}

fn parse_range_obj(v: &serde_json::Value) -> Option<MarkdownLspRange> {
    let start = v.get("start")?;
    let end = v.get("end")?;
    Some(MarkdownLspRange {
        start_line: start.get("line")?.as_u64()? as u32,
        start_character: start.get("character")?.as_u64()? as u32,
        end_line: end.get("line")?.as_u64()? as u32,
        end_character: end.get("character")?.as_u64()? as u32,
    })
}

fn parse_location_obj(v: &serde_json::Value) -> Option<MarkdownLspLocation> {
    Some(MarkdownLspLocation {
        uri: v.get("uri")?.as_str()?.to_string(),
        range: parse_range_obj(v.get("range")?)?,
    })
}

fn parse_locations(v: &serde_json::Value) -> Result<Vec<MarkdownLspLocation>, String> {
    if v.is_null() {
        return Ok(vec![]);
    }
    if let Some(obj) = v.as_object() {
        if obj.contains_key("uri") {
            return Ok(parse_location_obj(v).into_iter().collect());
        }
    }
    Ok(v.as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(parse_location_obj)
        .collect())
}

fn uri_to_path(uri: &str) -> Result<std::path::PathBuf, String> {
    // IWE sometimes returns URIs with the workspace root prepended to an absolute file URI,
    // e.g. "file:///vault/path/file:///vault/path/note.md". Detect and fix this.
    let effective_uri = if let Some(idx) = uri.rfind("file:///") {
        if idx > 0 {
            log::warn!(
                "uri_to_path: detected double-prefixed URI, extracting inner URI from: {}",
                uri
            );
            &uri[idx..]
        } else {
            uri
        }
    } else {
        uri
    };
    let parsed = url::Url::parse(effective_uri)
        .map_err(|e| format!("invalid URI '{}': {}", effective_uri, e))?;
    parsed
        .to_file_path()
        .map_err(|_| format!("non-file URI: {}", effective_uri))
}

fn percent_decode(s: &str) -> String {
    uri_utils::percent_decode(s)
}

async fn apply_workspace_edit(
    _vault_path: &std::path::Path,
    edit_response: &serde_json::Value,
) -> Result<MarkdownLspWorkspaceEditResult, String> {
    let mut result = MarkdownLspWorkspaceEditResult {
        files_created: vec![],
        files_deleted: vec![],
        files_modified: vec![],
        errors: vec![],
    };

    let edit = if let Some(e) = edit_response.get("edit") {
        e
    } else {
        edit_response
    };

    log::debug!(
        "apply_workspace_edit: edit_keys={:?} edit_preview={}",
        edit.as_object().map(|o| o.keys().collect::<Vec<_>>()),
        &edit.to_string()[..edit.to_string().len().min(500)]
    );

    let changes = edit.get("documentChanges").and_then(|c| c.as_array());
    if let Some(ops) = changes {
        for op in ops {
            if let Some(kind) = op.get("kind").and_then(|k| k.as_str()) {
                match kind {
                    "create" => {
                        if let Err(e) = apply_create_file(op).await {
                            result.errors.push(e);
                        } else if let Some(uri) = op.get("uri").and_then(|u| u.as_str()) {
                            result.files_created.push(uri.to_string());
                        }
                    }
                    "delete" => {
                        if let Err(e) = apply_delete_file(op).await {
                            result.errors.push(e);
                        } else if let Some(uri) = op.get("uri").and_then(|u| u.as_str()) {
                            result.files_deleted.push(uri.to_string());
                        }
                    }
                    "rename" => {
                        if let Err(e) = apply_rename_file(op).await {
                            result.errors.push(e);
                        } else {
                            if let Some(old) = op.get("oldUri").and_then(|u| u.as_str()) {
                                result.files_deleted.push(old.to_string());
                            }
                            if let Some(new) = op.get("newUri").and_then(|u| u.as_str()) {
                                result.files_created.push(new.to_string());
                            }
                        }
                    }
                    _ => {}
                }
            } else if op.get("textDocument").is_some() {
                if let Err(e) = apply_text_document_edit(op).await {
                    result.errors.push(e);
                } else if let Some(uri) = op
                    .get("textDocument")
                    .and_then(|td| td.get("uri"))
                    .and_then(|u| u.as_str())
                {
                    if !result.files_modified.contains(&uri.to_string()) {
                        result.files_modified.push(uri.to_string());
                    }
                }
            }
        }
    }

    if let Some(simple_changes) = edit.get("changes").and_then(|c| c.as_object()) {
        for (uri, edits) in simple_changes {
            if let Err(e) = apply_simple_text_edits(uri, edits).await {
                result.errors.push(e);
            } else if !result.files_modified.contains(uri) {
                result.files_modified.push(uri.clone());
            }
        }
    }

    Ok(result)
}

async fn apply_create_file(op: &serde_json::Value) -> Result<(), String> {
    let uri = op
        .get("uri")
        .and_then(|u| u.as_str())
        .ok_or("missing uri in create")?;
    let path = uri_to_path(uri)?;
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("create dir failed: {}", e))?;
    }
    tokio::fs::write(&path, "")
        .await
        .map_err(|e| format!("create file failed: {}", e))
}

async fn apply_delete_file(op: &serde_json::Value) -> Result<(), String> {
    let uri = op
        .get("uri")
        .and_then(|u| u.as_str())
        .ok_or("missing uri in delete")?;
    let path = uri_to_path(uri)?;
    if path.exists() {
        tokio::fs::remove_file(&path)
            .await
            .map_err(|e| format!("delete file failed: {}", e))?;
    }
    Ok(())
}

async fn apply_rename_file(op: &serde_json::Value) -> Result<(), String> {
    let old_uri = op
        .get("oldUri")
        .and_then(|u| u.as_str())
        .ok_or("missing oldUri in rename")?;
    let new_uri = op
        .get("newUri")
        .and_then(|u| u.as_str())
        .ok_or("missing newUri in rename")?;
    let old_path = uri_to_path(old_uri)?;
    let new_path = uri_to_path(new_uri)?;
    if let Some(parent) = new_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("create dir for rename failed: {}", e))?;
    }
    tokio::fs::rename(&old_path, &new_path)
        .await
        .map_err(|e| format!("rename file failed: {}", e))
}

async fn apply_text_document_edit(op: &serde_json::Value) -> Result<(), String> {
    let uri = op
        .get("textDocument")
        .and_then(|td| td.get("uri"))
        .and_then(|u| u.as_str())
        .ok_or("missing textDocument.uri")?;
    let edits = op
        .get("edits")
        .and_then(|e| e.as_array())
        .ok_or("missing edits")?;
    apply_edits_to_file(uri, edits).await
}

async fn apply_simple_text_edits(uri: &str, edits: &serde_json::Value) -> Result<(), String> {
    let edit_array = edits.as_array().ok_or("edits not an array")?;
    apply_edits_to_file(uri, edit_array).await
}

async fn apply_edits_to_file(uri: &str, edits: &[serde_json::Value]) -> Result<(), String> {
    let path = uri_to_path(uri)?;
    let content = tokio::fs::read_to_string(&path).await.map_err(|e| {
        log::warn!(
            "apply_edits_to_file: read failed uri={} resolved_path={} error={}",
            uri,
            path.display(),
            e
        );
        format!("read file failed: {}", e)
    })?;

    let lines: Vec<&str> = content.lines().collect();

    let mut sorted_edits: Vec<(&serde_json::Value, usize, usize)> = edits
        .iter()
        .filter_map(|edit| {
            let range = edit.get("range")?;
            let start = range.get("start")?;
            let end = range.get("end")?;
            let start_line = start.get("line").and_then(|l| l.as_u64()).unwrap_or(0) as usize;
            let start_char = start.get("character").and_then(|c| c.as_u64()).unwrap_or(0) as usize;
            let end_line = end.get("line").and_then(|l| l.as_u64()).unwrap_or(0) as usize;
            let end_char = end.get("character").and_then(|c| c.as_u64()).unwrap_or(0) as usize;
            let start_offset = line_col_to_offset(&lines, start_line, start_char);
            let end_offset = line_col_to_offset(&lines, end_line, end_char);
            Some((edit, start_offset, end_offset))
        })
        .collect();

    sorted_edits.sort_by(|a, b| a.1.cmp(&b.1));

    let mut result = String::with_capacity(content.len());
    let mut cursor = 0;
    for (edit, start_offset, end_offset) in &sorted_edits {
        let new_text = edit.get("newText").and_then(|t| t.as_str()).unwrap_or("");
        result.push_str(&content[cursor..*start_offset]);
        result.push_str(new_text);
        cursor = *end_offset;
    }
    result.push_str(&content[cursor..]);

    tokio::fs::write(&path, result)
        .await
        .map_err(|e| format!("write file failed: {}", e))
}

fn line_col_to_offset(lines: &[&str], line: usize, col: usize) -> usize {
    let mut offset = 0;
    for (i, l) in lines.iter().enumerate() {
        if i == line {
            return offset + col.min(l.len());
        }
        offset += l.len() + 1;
    }
    offset
}

#[tauri::command]
#[specta::specta]
pub async fn iwe_config_status(
    app: AppHandle,
    vault_id: String,
) -> Result<IweConfigStatus, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let config_path = vault_path.join(".iwe").join("config.toml");
    let config_url = url::Url::from_file_path(&config_path)
        .map(|u| u.to_string())
        .unwrap_or_default();

    let config_path_str = config_path.to_string_lossy().to_string();

    if !config_path.exists() {
        return Ok(IweConfigStatus {
            exists: false,
            config_url,
            config_path: config_path_str,
            action_count: 0,
            action_names: vec![],
            actions: vec![],
        });
    }

    let content = tokio::fs::read_to_string(&config_path)
        .await
        .map_err(|e| format!("Failed to read IWE config: {}", e))?;

    let mut action_names = Vec::new();
    let mut actions = Vec::new();

    let mut current_action_name: Option<String> = None;
    let mut current_type: Option<String> = None;
    let mut current_title: Option<String> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("[actions.") {
            if let Some(prev_name) = current_action_name.take() {
                action_names.push(prev_name.clone());
                actions.push(IweActionInfo {
                    name: prev_name.clone(),
                    action_type: current_type.take().unwrap_or_else(|| "unknown".into()),
                    title: current_title.take().unwrap_or(prev_name),
                });
            }
            current_action_name = rest.strip_suffix(']').map(|s| s.to_string());
            current_type = None;
            current_title = None;
        } else if current_action_name.is_some() {
            if trimmed.starts_with('[') {
                if let Some(prev_name) = current_action_name.take() {
                    action_names.push(prev_name.clone());
                    actions.push(IweActionInfo {
                        name: prev_name.clone(),
                        action_type: current_type.take().unwrap_or_else(|| "unknown".into()),
                        title: current_title.take().unwrap_or(prev_name),
                    });
                }
            } else if let Some(val) = trimmed.strip_prefix("type = ") {
                current_type = Some(val.trim_matches('"').to_string());
            } else if let Some(val) = trimmed.strip_prefix("title = ") {
                current_title = Some(val.trim_matches('"').to_string());
            }
        }
    }
    if let Some(prev_name) = current_action_name.take() {
        action_names.push(prev_name.clone());
        actions.push(IweActionInfo {
            name: prev_name.clone(),
            action_type: current_type.take().unwrap_or_else(|| "unknown".into()),
            title: current_title.take().unwrap_or(prev_name),
        });
    }

    Ok(IweConfigStatus {
        exists: true,
        config_url,
        config_path: config_path_str,
        action_count: action_names.len(),
        action_names,
        actions,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn iwe_config_reset(app: AppHandle, vault_id: String) -> Result<(), String> {
    let vault_mode = storage::vault_mode_for_id(&app, &vault_id)?;
    if vault_mode == storage::VaultMode::Browse {
        return Err("IWE config reset is only available in vault mode".to_string());
    }

    let vault_path = storage::vault_path(&app, &vault_id)?;
    let iwe_dir = vault_path.join(".iwe");
    let config_path = iwe_dir.join("config.toml");

    let default_config = app
        .path()
        .resolve(
            "resources/iwe-default-config.toml",
            tauri::path::BaseDirectory::Resource,
        )
        .map_err(|e| format!("Failed to resolve default config: {}", e))?;

    tokio::fs::create_dir_all(&iwe_dir)
        .await
        .map_err(|e| format!("Failed to create .iwe directory: {}", e))?;
    tokio::fs::copy(&default_config, &config_path)
        .await
        .map_err(|e| format!("Failed to copy default config: {}", e))?;

    log::info!("Reset IWE config at {}", config_path.display());
    Ok(())
}

struct ManagedTransform {
    command_name: &'static str,
    action_name: &'static str,
    title_suffix: &'static str,
    prompt: &'static str,
}

const MANAGED_TRANSFORMS: &[ManagedTransform] = &[
    ManagedTransform {
        command_name: "ai_rewrite",
        action_name: "rewrite",
        title_suffix: "Rewrite",
        prompt: "Rewrite the following text to improve clarity and readability. Keep the language personable, not overly formal. Simplify language, organize sentences logically, remove ambiguity. Preserve any markdown links. Do not include list item '-' or header '#' prefixes. Output only the rewritten text:",
    },
    ManagedTransform {
        command_name: "ai_summarize",
        action_name: "summarize",
        title_suffix: "Summarize",
        prompt: "Summarize the following text concisely. Output only the summary:",
    },
    ManagedTransform {
        command_name: "ai_expand",
        action_name: "expand",
        title_suffix: "Expand",
        prompt: "Expand the following text into a couple of detailed paragraphs. Preserve any markdown links. Do not include list item '-' or header '#' prefixes. Output only the expanded text:",
    },
    ManagedTransform {
        command_name: "ai_keywords",
        action_name: "keywords",
        title_suffix: "Keywords",
        prompt: "Mark the most important keywords with bold using ** markdown syntax. Keep the text otherwise completely unchanged. Output only the text with bold keywords:",
    },
    ManagedTransform {
        command_name: "ai_emojify",
        action_name: "emojify",
        title_suffix: "Emojify",
        prompt: "Add a relevant emoji before each list item, header, or paragraph. Keep the text otherwise completely unchanged. Output only the text with emojis:",
    },
];

const MANAGED_COMMAND_PREFIXES: &[&str] = &["ai_", "claude_"];

fn is_managed_command(name: &str) -> bool {
    MANAGED_COMMAND_PREFIXES.iter().any(|p| name.starts_with(p))
}

fn is_managed_action(name: &str) -> bool {
    MANAGED_TRANSFORMS.iter().any(|t| t.action_name == name)
}

fn provider_uses_prompt_in_args(args: &[String]) -> bool {
    args.iter().any(|a| a.contains("{prompt}"))
}

fn provider_uses_output_file(args: &[String]) -> bool {
    args.iter().any(|a| a.contains("{output_file}"))
}

fn build_command_toml(
    transform: &ManagedTransform,
    command: &str,
    args: &[String],
    model: &str,
    prompt_in_args: bool,
) -> String {
    let full_prompt = format!("{}\\n\\n{{{{context}}}}", transform.prompt);

    let final_args: Vec<String> = if prompt_in_args {
        args.iter()
            .map(|a| {
                let mut s = a.replace("{prompt}", &full_prompt);
                s = s.replace("{model}", model);
                s
            })
            .collect()
    } else {
        args.iter().map(|a| a.replace("{model}", model)).collect()
    };

    let args_str = final_args
        .iter()
        .map(|a| format!("\"{}\"", a.replace('\\', "\\\\").replace('"', "\\\"")))
        .collect::<Vec<_>>()
        .join(", ");

    format!(
        "[commands.{}]\nrun = \"{}\"\nargs = [{}]\nshell = false\ntimeout_seconds = 120\n",
        transform.command_name, command, args_str
    )
}

fn build_action_toml(
    transform: &ManagedTransform,
    provider_name: &str,
    prompt_in_args: bool,
) -> String {
    let input_template = if prompt_in_args {
        "{{context}}".to_string()
    } else {
        format!("{}\\n\\n{{{{context}}}}", transform.prompt)
    };

    format!(
        "[actions.{}]\ntype = \"transform\"\ntitle = \"{} ({})\"\ncommand = \"{}\"\ninput_template = \"{}\"\n",
        transform.action_name,
        transform.title_suffix,
        provider_name,
        transform.command_name,
        input_template,
    )
}

fn rewrite_iwe_config(
    content: &str,
    command: &str,
    args: &[String],
    model: &str,
    provider_name: &str,
) -> String {
    let prompt_in_args = provider_uses_prompt_in_args(args);

    // Parse into sections: (header_line, body_lines)
    // We'll rebuild by removing managed sections and inserting new ones.
    let mut result_lines: Vec<String> = Vec::new();
    let mut skip_section = false;
    let mut inserted_commands = false;
    let mut inserted_actions = false;
    let mut last_was_commands_header = false;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with('[') {
            skip_section = false;

            // Check if this is a managed [commands.ai_*] or [commands.claude_*]
            if let Some(rest) = trimmed.strip_prefix("[commands.") {
                if let Some(name) = rest.strip_suffix(']') {
                    if is_managed_command(name) {
                        skip_section = true;
                        if !inserted_commands {
                            inserted_commands = true;
                            for t in MANAGED_TRANSFORMS {
                                result_lines.push(build_command_toml(
                                    t,
                                    command,
                                    args,
                                    model,
                                    prompt_in_args,
                                ));
                            }
                        }
                        continue;
                    }
                }
            }

            // Check if this is a managed [actions.*]
            if let Some(rest) = trimmed.strip_prefix("[actions.") {
                if let Some(name) = rest.strip_suffix(']') {
                    if is_managed_action(name) {
                        skip_section = true;
                        if !inserted_actions {
                            inserted_actions = true;
                            for t in MANAGED_TRANSFORMS {
                                result_lines.push(build_action_toml(
                                    t,
                                    provider_name,
                                    prompt_in_args,
                                ));
                            }
                        }
                        continue;
                    }
                }
            }

            // Bare [commands] header
            if trimmed == "[commands]" {
                last_was_commands_header = true;
                result_lines.push(line.to_string());
                continue;
            }

            last_was_commands_header = false;
        }

        if skip_section {
            continue;
        }

        // Insert managed commands right after bare [commands] header
        if last_was_commands_header && !trimmed.is_empty() && !trimmed.starts_with('#') {
            last_was_commands_header = false;
        }

        result_lines.push(line.to_string());
    }

    // If we never found managed command sections, insert after [commands] header
    if !inserted_commands {
        let mut final_lines: Vec<String> = Vec::new();
        for line in &result_lines {
            final_lines.push(line.clone());
            if line.trim() == "[commands]" {
                final_lines.push(String::new());
                for t in MANAGED_TRANSFORMS {
                    final_lines.push(build_command_toml(t, command, args, model, prompt_in_args));
                }
            }
        }
        result_lines = final_lines;
    }

    // If we never found managed action sections, append before [markdown]
    if !inserted_actions {
        let mut final_lines: Vec<String> = Vec::new();
        let mut inserted = false;
        for line in &result_lines {
            if !inserted && line.trim() == "[markdown]" {
                for t in MANAGED_TRANSFORMS {
                    final_lines.push(build_action_toml(t, provider_name, prompt_in_args));
                }
                inserted = true;
            }
            final_lines.push(line.clone());
        }
        if !inserted {
            for t in MANAGED_TRANSFORMS {
                final_lines.push(build_action_toml(t, provider_name, prompt_in_args));
            }
        }
        result_lines = final_lines;
    }

    let mut output = result_lines.join("\n");
    if !output.ends_with('\n') {
        output.push('\n');
    }
    output
}

#[tauri::command]
#[specta::specta]
pub async fn iwe_config_rewrite_provider(
    app: AppHandle,
    vault_id: String,
    provider_config: AiProviderConfig,
) -> Result<(), String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let config_path = vault_path.join(".iwe").join("config.toml");

    if !config_path.exists() {
        return Err("IWE config does not exist yet".to_string());
    }

    let (command, args) = match &provider_config.transport {
        crate::features::ai::service::AiTransport::Cli { command, args } => {
            (command.clone(), args.clone())
        }
        crate::features::ai::service::AiTransport::Api { .. } => {
            return Err("API providers are not supported for IWE transforms".to_string());
        }
    };

    if provider_uses_output_file(&args) {
        return Err(format!(
            "{} uses output files which are incompatible with IWE transforms",
            provider_config.name
        ));
    }

    let model = provider_config.model.as_deref().unwrap_or("");
    let content = tokio::fs::read_to_string(&config_path)
        .await
        .map_err(|e| format!("Failed to read IWE config: {}", e))?;

    let rewritten = rewrite_iwe_config(&content, &command, &args, model, &provider_config.name);

    if rewritten == content {
        log::debug!(
            "IWE config unchanged for provider '{}', skipping write",
            provider_config.name
        );
        return Ok(());
    }

    tokio::fs::write(&config_path, &rewritten)
        .await
        .map_err(|e| format!("Failed to write IWE config: {}", e))?;

    log::info!(
        "Rewrote IWE config for provider '{}' at {}",
        provider_config.name,
        config_path.display()
    );
    Ok(())
}
