pub mod language_config;
pub mod manager;
pub mod types;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, State};
use tokio::sync::Mutex;

use manager::CodeLspManager;
use types::*;

#[derive(Default)]
pub struct CodeLspState {
    pub inner: Arc<Mutex<HashMap<String, Arc<Mutex<CodeLspManager>>>>>,
}

impl CodeLspState {
    pub async fn shutdown(&self) {
        for (id, mgr) in self.inner.lock().await.drain() {
            log::info!("Stopping code LSP for vault {}", id);
            mgr.lock().await.stop_all().await;
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn code_lsp_open_file(
    app: AppHandle,
    state: State<'_, CodeLspState>,
    vault_id: String,
    vault_path: String,
    path: String,
    content: String,
) -> Result<(), String> {
    let mgr = {
        let mut managers = state.inner.lock().await;
        let entry = managers.entry(vault_id.clone()).or_insert_with(|| {
            Arc::new(Mutex::new(CodeLspManager::new(
                vault_id,
                PathBuf::from(&vault_path),
                app,
            )))
        });
        Arc::clone(entry)
    };
    let result = mgr.lock().await.open_file(&path, &content).await;
    result
}

#[tauri::command]
#[specta::specta]
pub async fn code_lsp_close_file(
    state: State<'_, CodeLspState>,
    vault_id: String,
    path: String,
) -> Result<(), String> {
    let mgr = {
        let managers = state.inner.lock().await;
        managers.get(&vault_id).cloned()
    };
    if let Some(mgr) = mgr {
        mgr.lock().await.close_file(&path).await?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn code_lsp_stop_vault(
    state: State<'_, CodeLspState>,
    vault_id: String,
) -> Result<(), String> {
    let mgr = { state.inner.lock().await.remove(&vault_id) };
    if let Some(mgr) = mgr {
        mgr.lock().await.stop_all().await;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn code_lsp_available_languages(vault_id: String) -> Result<Vec<String>, String> {
    let mut available = Vec::new();
    for spec in &[
        ("python", "pyright-langserver"),
        ("rust", "rust-analyzer"),
        ("typescript", "typescript-language-server"),
        ("go", "gopls"),
    ] {
        if language_config::find_binary(spec.1).is_some() {
            available.push(spec.0.to_string());
        }
    }
    let _ = vault_id;
    Ok(available)
}

#[tauri::command]
#[specta::specta]
pub async fn code_lsp_get_status(
    state: State<'_, CodeLspState>,
    vault_id: String,
    _language: String,
) -> Result<CodeLspStatus, String> {
    let managers = state.inner.lock().await;
    match managers.get(&vault_id) {
        Some(_mgr) => Ok(CodeLspStatus::Running),
        None => Ok(CodeLspStatus::Stopped),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn code_lsp_did_change(
    state: State<'_, CodeLspState>,
    vault_id: String,
    file_path: String,
    content: String,
) -> Result<(), String> {
    let mgr = {
        let managers = state.inner.lock().await;
        managers.get(&vault_id).cloned()
    };
    if let Some(mgr) = mgr {
        mgr.lock().await.did_change(&file_path, &content).await?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn code_lsp_hover(
    state: State<'_, CodeLspState>,
    vault_id: String,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<CodeLspHoverResult, String> {
    let (handle, uri) = {
        let managers = state.inner.lock().await;
        let mgr = managers
            .get(&vault_id)
            .ok_or_else(|| format!("Code LSP not started for vault {}", vault_id))?
            .clone();
        let mgr = mgr.lock().await;
        let handle = mgr
            .request_handle_for(&file_path)
            .ok_or_else(|| format!("No LSP session for {}", file_path))?;
        let uri = mgr.file_uri_for(&file_path);
        (handle, uri)
    };

    let result = handle
        .send_request(
            "textDocument/hover",
            serde_json::json!({
                "textDocument": { "uri": uri },
                "position": { "line": line, "character": character }
            }),
        )
        .await
        .map_err(|e| e.to_string())?;

    let contents = result
        .get("contents")
        .and_then(|c| {
            c.get("value")
                .and_then(|v| v.as_str())
                .or_else(|| c.as_str())
        })
        .map(String::from);

    Ok(CodeLspHoverResult { contents })
}

#[tauri::command]
#[specta::specta]
pub async fn code_lsp_completion(
    state: State<'_, CodeLspState>,
    vault_id: String,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<Vec<CodeLspCompletionItem>, String> {
    let (handle, uri) = {
        let managers = state.inner.lock().await;
        let mgr = managers
            .get(&vault_id)
            .ok_or_else(|| format!("Code LSP not started for vault {}", vault_id))?
            .clone();
        let mgr = mgr.lock().await;
        let handle = mgr
            .request_handle_for(&file_path)
            .ok_or_else(|| format!("No LSP session for {}", file_path))?;
        let uri = mgr.file_uri_for(&file_path);
        (handle, uri)
    };

    let result = handle
        .send_request(
            "textDocument/completion",
            serde_json::json!({
                "textDocument": { "uri": uri },
                "position": { "line": line, "character": character }
            }),
        )
        .await
        .map_err(|e| e.to_string())?;

    let items = result
        .get("items")
        .and_then(|i| i.as_array())
        .or_else(|| result.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    Some(CodeLspCompletionItem {
                        label: item.get("label")?.as_str()?.to_string(),
                        detail: item
                            .get("detail")
                            .and_then(|d| d.as_str())
                            .map(String::from),
                        insert_text: item
                            .get("insertText")
                            .and_then(|t| t.as_str())
                            .map(String::from),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(items)
}

#[tauri::command]
#[specta::specta]
pub async fn code_lsp_definition(
    state: State<'_, CodeLspState>,
    vault_id: String,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<Vec<CodeLspLocation>, String> {
    let (handle, uri) = {
        let managers = state.inner.lock().await;
        let mgr = managers
            .get(&vault_id)
            .ok_or_else(|| format!("Code LSP not started for vault {}", vault_id))?
            .clone();
        let mgr = mgr.lock().await;
        let handle = mgr
            .request_handle_for(&file_path)
            .ok_or_else(|| format!("No LSP session for {}", file_path))?;
        let uri = mgr.file_uri_for(&file_path);
        (handle, uri)
    };

    let result = handle
        .send_request(
            "textDocument/definition",
            serde_json::json!({
                "textDocument": { "uri": uri },
                "position": { "line": line, "character": character }
            }),
        )
        .await
        .map_err(|e| e.to_string())?;

    parse_locations(&result)
}

#[tauri::command]
#[specta::specta]
pub async fn code_lsp_code_actions(
    state: State<'_, CodeLspState>,
    vault_id: String,
    file_path: String,
    start_line: u32,
    start_character: u32,
    end_line: u32,
    end_character: u32,
) -> Result<Vec<CodeLspCodeAction>, String> {
    let (handle, uri) = {
        let managers = state.inner.lock().await;
        let mgr = managers
            .get(&vault_id)
            .ok_or_else(|| format!("Code LSP not started for vault {}", vault_id))?
            .clone();
        let mgr = mgr.lock().await;
        let handle = mgr
            .request_handle_for(&file_path)
            .ok_or_else(|| format!("No LSP session for {}", file_path))?;
        let uri = mgr.file_uri_for(&file_path);
        (handle, uri)
    };

    let result = handle
        .send_request(
            "textDocument/codeAction",
            serde_json::json!({
                "textDocument": { "uri": uri },
                "range": {
                    "start": { "line": start_line, "character": start_character },
                    "end": { "line": end_line, "character": end_character }
                },
                "context": { "diagnostics": [] }
            }),
        )
        .await
        .map_err(|e| e.to_string())?;

    let actions = result
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|a| {
            Some(CodeLspCodeAction {
                title: a.get("title")?.as_str()?.to_string(),
                kind: a.get("kind").and_then(|k| k.as_str()).map(String::from),
                data: a.get("data").map(|d| d.to_string()),
                raw_json: Some(a.to_string()),
            })
        })
        .collect();

    Ok(actions)
}

fn parse_location_obj(loc: &serde_json::Value) -> Option<CodeLspLocation> {
    let uri = loc.get("uri")?.as_str()?.to_string();
    let range = loc.get("range")?;
    let start = range.get("start")?;
    let end = range.get("end")?;
    Some(CodeLspLocation {
        uri,
        range: CodeLspRange {
            start_line: start.get("line")?.as_u64()? as u32,
            start_character: start.get("character")?.as_u64()? as u32,
            end_line: end.get("line")?.as_u64()? as u32,
            end_character: end.get("character")?.as_u64()? as u32,
        },
    })
}

fn parse_locations(result: &serde_json::Value) -> Result<Vec<CodeLspLocation>, String> {
    if result.is_null() {
        return Ok(vec![]);
    }
    if let Some(arr) = result.as_array() {
        return Ok(arr.iter().filter_map(parse_location_obj).collect());
    }
    if let Some(loc) = parse_location_obj(result) {
        return Ok(vec![loc]);
    }
    Ok(vec![])
}
