use crate::features::toolchain;
use crate::shared::lsp_client::{
    LspClientConfig, LspClientError, LspSessionStatus, RestartableConfig, RestartableLspClient,
    ServerNotification,
};
use crate::shared::storage;
use serde::Serialize;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;

use super::types::*;

pub struct MarksmanState {
    clients: Mutex<HashMap<String, RestartableLspClient>>,
}

impl Default for MarksmanState {
    fn default() -> Self {
        Self {
            clients: Mutex::new(HashMap::new()),
        }
    }
}

impl MarksmanState {
    async fn request(
        &self,
        vault_id: &str,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let clients = self.clients.lock().await;
        let client = clients
            .get(vault_id)
            .ok_or_else(|| format!("Marksman not started for vault {}", vault_id))?;
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
            .ok_or_else(|| format!("Marksman not started for vault {}", vault_id))?;
        client.send_notification(method, params).await.map_err(err)
    }
}

fn file_uri(vault_path: &std::path::Path, file_path: &str) -> String {
    let full = vault_path.join(file_path);
    tauri::Url::from_file_path(&full)
        .map(|u| u.to_string())
        .unwrap_or_else(|_| format!("file://{}", full.display()))
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

fn marksman_state(app: &AppHandle) -> tauri::State<'_, MarksmanState> {
    app.state::<MarksmanState>()
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum MarksmanEvent {
    DiagnosticsUpdated {
        vault_id: String,
        uri: String,
        diagnostics: Vec<MarksmanLspDiagnostic>,
    },
    StatusChanged {
        vault_id: String,
        status: String,
    },
}

#[derive(Debug, Clone, Serialize)]
struct MarksmanLspDiagnostic {
    line: u32,
    character: u32,
    end_line: u32,
    end_character: u32,
    severity: String,
    message: String,
}

fn lsp_severity_to_string(severity: Option<u64>) -> String {
    match severity {
        Some(1) => "error",
        Some(2) => "warning",
        Some(3) => "info",
        _ => "hint",
    }
    .to_string()
}

fn parse_lsp_diagnostics(
    params: &serde_json::Value,
) -> Option<(String, Vec<MarksmanLspDiagnostic>)> {
    let uri = params.get("uri")?.as_str()?.to_string();
    let diags = params
        .get("diagnostics")?
        .as_array()?
        .iter()
        .filter_map(|d| {
            let range = d.get("range")?;
            let start = range.get("start")?;
            let end = range.get("end")?;
            Some(MarksmanLspDiagnostic {
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
                        "marksman_event",
                        MarksmanEvent::DiagnosticsUpdated {
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

fn spawn_status_forwarder(
    app: AppHandle,
    vault_id: String,
    mut status_rx: tokio::sync::mpsc::Receiver<LspSessionStatus>,
) {
    tokio::spawn(async move {
        while let Some(status) = status_rx.recv().await {
            let status_str = match &status {
                LspSessionStatus::Starting => "starting".to_string(),
                LspSessionStatus::Running => "running".to_string(),
                LspSessionStatus::Restarting { attempt } => {
                    format!("restarting (attempt {})", attempt)
                }
                LspSessionStatus::Stopped => "stopped".to_string(),
                LspSessionStatus::Failed { message } => format!("failed: {}", message),
            };
            let _ = app.emit(
                "marksman_event",
                MarksmanEvent::StatusChanged {
                    vault_id: vault_id.clone(),
                    status: status_str,
                },
            );
        }
    });
}

#[tauri::command]
#[specta::specta]
pub async fn marksman_start(
    app: AppHandle,
    vault_id: String,
    provider: Option<String>,
    custom_binary_path: Option<String>,
) -> Result<MarksmanStartResult, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let root_uri = tauri::Url::from_file_path(&vault_path)
        .map_err(|_| "invalid vault path for URI".to_string())?
        .to_string();

    let custom_ref = custom_binary_path.as_deref();
    let preferred = provider.as_deref().unwrap_or("iwes");

    let resolved_path = match preferred {
        "iwes" => {
            match toolchain::resolver::resolve(&app, "iwes", custom_ref).await {
                Ok(path) => {
                    log::info!("Using IWE language server: {}", path.display());
                    path
                }
                Err(e) => {
                    log::warn!("IWE not available ({}), falling back to Marksman", e);
                    toolchain::resolver::resolve(&app, "marksman", None).await?
                }
            }
        }
        "marksman" => {
            toolchain::resolver::resolve(&app, "marksman", custom_ref).await?
        }
        other => {
            return Err(format!("Unknown markdown LSP provider: {}", other));
        }
    };

    if preferred == "iwes" {
        let iwe_dir = vault_path.join(".iwe");
        let iwe_config = iwe_dir.join("config.toml");
        let needs_copy = if iwe_config.exists() {
            let content = std::fs::read_to_string(&iwe_config).unwrap_or_default();
            !content.contains("[commands]")
        } else {
            true
        };
        if needs_copy {
            if let Ok(default_config) = app
                .path()
                .resolve("resources/iwe-default-config.toml", tauri::path::BaseDirectory::Resource)
            {
                let _ = std::fs::create_dir_all(&iwe_dir);
                let _ = std::fs::copy(&default_config, &iwe_config);
                log::info!("Wrote IWE config at {}", iwe_config.display());
            }
        }
    }

    let config = LspClientConfig {
        binary_path: resolved_path.to_string_lossy().into_owned(),
        args: vec![],
        root_uri,
        capabilities: serde_json::json!({}),
        working_dir: Some(
            vault_path
                .to_str()
                .ok_or("invalid vault path encoding")?
                .to_string(),
        ),
        request_timeout_ms: 30_000,
    };

    let mut client = RestartableLspClient::start(RestartableConfig::new(config))
        .await
        .map_err(err)?;

    let trigger_characters = if preferred == "iwes" {
        vec!["+".to_string(), "[".to_string(), "(".to_string()]
    } else {
        vec!["[".to_string(), "(".to_string(), "#".to_string()]
    };

    if let Some(rx) = client.take_notification_rx() {
        spawn_notification_forwarder(app.clone(), vault_id.clone(), rx);
    }

    if let Some(rx) = client.take_status_rx() {
        spawn_status_forwarder(app.clone(), vault_id.clone(), rx);
    }

    let state = marksman_state(&app);
    state.clients.lock().await.insert(vault_id, client);
    Ok(MarksmanStartResult {
        completion_trigger_characters: trigger_characters,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn marksman_stop(app: AppHandle, vault_id: String) -> Result<(), String> {
    let state = marksman_state(&app);
    if let Some(client) = state.clients.lock().await.remove(&vault_id) {
        client.stop().await;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn marksman_did_open(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    content: String,
) -> Result<(), String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    marksman_state(&app)
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
pub async fn marksman_did_change(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    version: i32,
    content: String,
) -> Result<(), String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    marksman_state(&app)
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
pub async fn marksman_did_save(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    content: String,
) -> Result<(), String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    marksman_state(&app)
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
pub async fn marksman_hover(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<MarksmanHoverResult, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    let result = marksman_state(&app)
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

    Ok(MarksmanHoverResult { contents })
}

#[tauri::command]
#[specta::specta]
pub async fn marksman_references(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<Vec<MarksmanLocation>, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    let result = marksman_state(&app)
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
pub async fn marksman_definition(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<Vec<MarksmanLocation>, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    let result = marksman_state(&app)
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
pub async fn marksman_code_actions(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    start_line: u32,
    start_character: u32,
    end_line: u32,
    end_character: u32,
) -> Result<Vec<MarksmanCodeAction>, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    let result = marksman_state(&app)
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
            Some(MarksmanCodeAction {
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
pub async fn marksman_code_action_resolve(
    app: AppHandle,
    vault_id: String,
    code_action_json: String,
) -> Result<MarksmanWorkspaceEditResult, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(&code_action_json).map_err(|e| e.to_string())?;
    let result = marksman_state(&app)
        .request(&vault_id, "codeAction/resolve", parsed)
        .await?;

    let vault_path = storage::vault_path(&app, &vault_id)?;
    apply_workspace_edit(&vault_path, &result).await
}

#[tauri::command]
#[specta::specta]
pub async fn marksman_workspace_symbols(
    app: AppHandle,
    vault_id: String,
    query: String,
) -> Result<Vec<MarksmanSymbol>, String> {
    let result = marksman_state(&app)
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
            Some(MarksmanSymbol {
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
pub async fn marksman_rename(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    line: u32,
    character: u32,
    new_name: String,
) -> Result<MarksmanWorkspaceEditResult, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    let result = marksman_state(&app)
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
pub async fn marksman_prepare_rename(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<Option<MarksmanPrepareRenameResult>, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    let result = marksman_state(&app)
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

    Ok(Some(MarksmanPrepareRenameResult { range, placeholder }))
}

fn normalize_completion_item(item: &serde_json::Value) -> Option<MarksmanCompletionItem> {
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
    Some(MarksmanCompletionItem {
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
pub async fn marksman_completion(
    app: AppHandle,
    vault_id: String,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<Vec<MarksmanCompletionItem>, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    log::trace!("Marksman completion request uri={}", uri);
    let result = marksman_state(&app)
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
pub async fn marksman_formatting(
    app: AppHandle,
    vault_id: String,
    file_path: String,
) -> Result<Vec<MarksmanTextEdit>, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    let result = marksman_state(&app)
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
            Some(MarksmanTextEdit {
                range,
                new_text: edit.get("newText")?.as_str()?.replace('\t', "    "),
            })
        })
        .collect();

    Ok(edits)
}

#[tauri::command]
#[specta::specta]
pub async fn marksman_inlay_hints(
    app: AppHandle,
    vault_id: String,
    file_path: String,
) -> Result<Vec<MarksmanInlayHint>, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    let result = marksman_state(&app)
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
            Some(MarksmanInlayHint {
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
pub async fn marksman_document_symbols(
    app: AppHandle,
    vault_id: String,
    file_path: String,
) -> Result<Vec<MarksmanDocumentSymbol>, String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let uri = file_uri(&vault_path, &file_path);
    let result = marksman_state(&app)
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
            Some(MarksmanDocumentSymbol {
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

fn parse_range_obj(v: &serde_json::Value) -> Option<MarksmanRange> {
    let start = v.get("start")?;
    let end = v.get("end")?;
    Some(MarksmanRange {
        start_line: start.get("line")?.as_u64()? as u32,
        start_character: start.get("character")?.as_u64()? as u32,
        end_line: end.get("line")?.as_u64()? as u32,
        end_character: end.get("character")?.as_u64()? as u32,
    })
}

fn parse_location_obj(v: &serde_json::Value) -> Option<MarksmanLocation> {
    Some(MarksmanLocation {
        uri: v.get("uri")?.as_str()?.to_string(),
        range: parse_range_obj(v.get("range")?)?,
    })
}

fn parse_locations(v: &serde_json::Value) -> Result<Vec<MarksmanLocation>, String> {
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
    let path_str = uri
        .strip_prefix("file://")
        .ok_or_else(|| format!("non-file URI: {}", uri))?;
    let decoded = percent_decode(path_str);
    Ok(std::path::PathBuf::from(decoded))
}

fn percent_decode(s: &str) -> String {
    let mut bytes = Vec::with_capacity(s.len());
    let mut iter = s.bytes();
    while let Some(b) = iter.next() {
        if b == b'%' {
            let hi = iter.next().and_then(|c| (c as char).to_digit(16));
            let lo = iter.next().and_then(|c| (c as char).to_digit(16));
            if let (Some(h), Some(l)) = (hi, lo) {
                bytes.push((h * 16 + l) as u8);
            }
        } else {
            bytes.push(b);
        }
    }
    String::from_utf8(bytes).unwrap_or_else(|_| s.to_string())
}

async fn apply_workspace_edit(
    _vault_path: &std::path::Path,
    edit_response: &serde_json::Value,
) -> Result<MarksmanWorkspaceEditResult, String> {
    let mut result = MarksmanWorkspaceEditResult {
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
    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("read file failed: {}", e))?;

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

    if !config_path.exists() {
        return Ok(IweConfigStatus {
            exists: false,
            config_url,
            action_count: 0,
            action_names: vec![],
        });
    }

    let content = tokio::fs::read_to_string(&config_path)
        .await
        .map_err(|e| format!("Failed to read IWE config: {}", e))?;

    let mut action_names = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("[actions.") {
            if let Some(name) = rest.strip_suffix(']') {
                action_names.push(name.to_string());
            }
        }
    }

    Ok(IweConfigStatus {
        exists: true,
        config_url,
        action_count: action_names.len(),
        action_names,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn iwe_config_reset(app: AppHandle, vault_id: String) -> Result<(), String> {
    let vault_path = storage::vault_path(&app, &vault_id)?;
    let iwe_dir = vault_path.join(".iwe");
    let config_path = iwe_dir.join("config.toml");

    let default_config = app
        .path()
        .resolve("resources/iwe-default-config.toml", tauri::path::BaseDirectory::Resource)
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
