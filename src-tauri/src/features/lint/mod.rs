pub mod cli;
pub mod config;
pub mod lsp;
pub mod service;
pub mod types;

use service::LintState;
use types::*;

use std::path::Path;
use tauri::{AppHandle, State};

use super::settings;
#[cfg(feature = "feat-toolchain")]
use super::toolchain;

fn resolve_uri(vault_path: &Path, rel_path: &str) -> String {
    let abs = vault_path.join(rel_path);
    format!("file://{}", abs.display())
}

async fn resolve_rumdl_binary(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let custom_path = settings::service::load_settings(app)
        .ok()
        .and_then(|store| store.settings.get("rumdl_binary_path").cloned())
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .filter(|s| !s.is_empty());
    #[cfg(feature = "feat-toolchain")]
    return toolchain::resolver::resolve(app, "rumdl", custom_path.as_deref()).await;
    #[cfg(not(feature = "feat-toolchain"))]
    return Ok(std::path::PathBuf::from(
        custom_path.as_deref().unwrap_or("rumdl"),
    ));
}

#[tauri::command]
#[specta::specta]
pub async fn lint_start(
    app: AppHandle,
    state: State<'_, LintState>,
    vault_id: String,
    vault_path: String,
    user_overrides: String,
    browse_mode: bool,
) -> Result<(), String> {
    let vault = std::path::PathBuf::from(&vault_path);
    if !browse_mode {
        if user_overrides.is_empty() {
            config::write_default_config(&vault).map_err(|e| e.to_string())?;
        } else {
            config::write_merged_config(&vault, &user_overrides).map_err(|e| e.to_string())?;
        }
    }
    state
        .start_session(&vault_id, vault, browse_mode, app)
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn lint_stop(state: State<'_, LintState>, vault_id: String) -> Result<(), String> {
    state.stop_session(&vault_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn lint_open_file(
    state: State<'_, LintState>,
    vault_id: String,
    path: String,
    content: String,
    version: i32,
) -> Result<(), String> {
    let sessions = state.inner.lock().await;
    let session = sessions
        .get(&vault_id)
        .ok_or_else(|| format!("No active lint session for vault {}", vault_id))?;
    let uri = resolve_uri(&session.vault_path, &path);
    let params = serde_json::json!({
        "textDocument": {
            "uri": uri,
            "languageId": "markdown",
            "version": version,
            "text": content,
        }
    });
    session
        .client
        .send_notification("textDocument/didOpen", params)
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn lint_update_file(
    state: State<'_, LintState>,
    vault_id: String,
    path: String,
    content: String,
    version: i32,
) -> Result<(), String> {
    let sessions = state.inner.lock().await;
    let session = sessions
        .get(&vault_id)
        .ok_or_else(|| format!("No active lint session for vault {}", vault_id))?;
    let uri = resolve_uri(&session.vault_path, &path);
    let params = serde_json::json!({
        "textDocument": {
            "uri": uri,
            "version": version,
        },
        "contentChanges": [{
            "text": content,
        }]
    });
    session
        .client
        .send_notification("textDocument/didChange", params)
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn lint_close_file(
    state: State<'_, LintState>,
    vault_id: String,
    path: String,
) -> Result<(), String> {
    let sessions = state.inner.lock().await;
    let session = sessions
        .get(&vault_id)
        .ok_or_else(|| format!("No active lint session for vault {}", vault_id))?;
    let uri = resolve_uri(&session.vault_path, &path);
    let params = serde_json::json!({
        "textDocument": {
            "uri": uri,
        }
    });
    session
        .client
        .send_notification("textDocument/didClose", params)
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn lint_format_file(
    app: AppHandle,
    state: State<'_, LintState>,
    vault_id: String,
    path: String,
    content: String,
    formatter: String,
) -> Result<Vec<LintTextEdit>, String> {
    let (uri, vault_path) = {
        let sessions = state.inner.lock().await;
        let session = sessions
            .get(&vault_id)
            .ok_or_else(|| format!("No active lint session for vault {}", vault_id))?;
        let uri = resolve_uri(&session.vault_path, &path);
        let vault_path = session.vault_path.clone();
        (uri, vault_path)
    };

    let lsp_result = {
        let sessions = state.inner.lock().await;
        let session = sessions
            .get(&vault_id)
            .ok_or_else(|| format!("No active lint session for vault {}", vault_id))?;
        let params = serde_json::json!({
            "textDocument": {
                "uri": uri,
            },
            "options": {
                "tabSize": 4,
                "insertSpaces": true,
            }
        });
        session
            .client
            .send_request("textDocument/formatting", params)
            .await?
    };

    let edits: Vec<LintTextEdit> = match &lsp_result {
        serde_json::Value::Array(arr) if !arr.is_empty() => arr
            .iter()
            .filter_map(|edit| {
                let range = edit.get("range")?;
                let start = range.get("start")?;
                let end = range.get("end")?;
                Some(LintTextEdit {
                    start_line: start["line"].as_u64()? as u32 + 1,
                    start_column: start["character"].as_u64()? as u32 + 1,
                    end_line: end["line"].as_u64()? as u32 + 1,
                    end_column: end["character"].as_u64()? as u32 + 1,
                    new_text: edit["newText"].as_str()?.to_string(),
                })
            })
            .collect(),
        serde_json::Value::Null | serde_json::Value::Array(_) => {
            log::debug!(
                "LSP returned null/empty for formatting ({}), falling back to CLI",
                uri
            );
            let binary = resolve_rumdl_binary(&app).await?;
            match cli::format_file_content(&binary, &vault_path, &content, &formatter).await {
                Ok(formatted) if formatted != content => {
                    let line_count = content.lines().count().max(1);
                    let last_line_len = content.lines().last().map(|l| l.len()).unwrap_or(0);
                    vec![LintTextEdit {
                        start_line: 1,
                        start_column: 1,
                        end_line: line_count as u32,
                        end_column: last_line_len as u32 + 1,
                        new_text: formatted,
                    }]
                }
                Ok(_) => Vec::new(),
                Err(e) => {
                    log::warn!("CLI format fallback failed for {}: {}", path, e);
                    Vec::new()
                }
            }
        }
        other => {
            log::warn!("Unexpected formatting response for {}: {:?}", uri, other);
            Vec::new()
        }
    };

    log::debug!("Format {} → {} edits", path, edits.len());
    Ok(edits)
}

#[tauri::command]
#[specta::specta]
pub async fn lint_fix_all(
    state: State<'_, LintState>,
    vault_id: String,
    path: String,
) -> Result<Option<String>, String> {
    let sessions = state.inner.lock().await;
    let session = sessions
        .get(&vault_id)
        .ok_or_else(|| format!("No active lint session for vault {}", vault_id))?;
    let uri = resolve_uri(&session.vault_path, &path);
    let abs_path = session.vault_path.join(&path);

    let params = serde_json::json!({
        "textDocument": {
            "uri": uri,
        },
        "range": {
            "start": { "line": 0, "character": 0 },
            "end": { "line": 999999, "character": 0 },
        },
        "context": {
            "diagnostics": [],
            "only": ["quickfix"],
        }
    });

    let result = session
        .client
        .send_request("textDocument/codeAction", params)
        .await?;

    if let serde_json::Value::Array(actions) = &result {
        if actions.is_empty() {
            return Ok(None);
        }

        let mut all_edits: Vec<serde_json::Value> = Vec::new();
        for action in actions {
            if let Some(edit) = action.get("edit") {
                if let Some(changes) = edit.get("changes") {
                    if let Some(file_edits) = changes.get(&uri) {
                        if let Some(arr) = file_edits.as_array() {
                            all_edits.extend(arr.iter().cloned());
                        }
                    }
                }
                if let Some(doc_changes) = edit.get("documentChanges") {
                    if let Some(arr) = doc_changes.as_array() {
                        for doc_change in arr {
                            if let Some(edits) = doc_change.get("edits") {
                                if let Some(arr) = edits.as_array() {
                                    all_edits.extend(arr.iter().cloned());
                                }
                            }
                        }
                    }
                }
            }
        }

        if all_edits.is_empty() {
            return Ok(None);
        }

        let abs_path = abs_path.clone();
        drop(sessions);

        let content = tokio::fs::read_to_string(&abs_path)
            .await
            .map_err(|e| e.to_string())?;

        let fixed = apply_text_edits(&content, &all_edits);
        return Ok(Some(fixed));
    }

    Ok(None)
}

fn apply_text_edits(content: &str, edits: &[serde_json::Value]) -> String {
    let lines: Vec<&str> = content.lines().collect();

    let mut offset_edits: Vec<(usize, usize, String)> = edits
        .iter()
        .filter_map(|edit| {
            let range = edit.get("range")?;
            let start = range.get("start")?;
            let end = range.get("end")?;
            let start_line = start["line"].as_u64()? as usize;
            let start_char = start["character"].as_u64()? as usize;
            let end_line = end["line"].as_u64()? as usize;
            let end_char = end["character"].as_u64()? as usize;
            let new_text = edit["newText"].as_str()?.to_string();

            let start_offset = line_col_to_offset(&lines, start_line, start_char);
            let end_offset = line_col_to_offset(&lines, end_line, end_char);

            Some((start_offset, end_offset, new_text))
        })
        .collect();

    offset_edits.sort_by(|a, b| b.0.cmp(&a.0));

    let mut result = content.to_string();
    for (start, end, new_text) in offset_edits {
        let start = start.min(result.len());
        let end = end.min(result.len());
        result.replace_range(start..end, &new_text);
    }

    result
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
pub async fn lint_check_vault(
    app: AppHandle,
    vault_path: String,
) -> Result<Vec<FileDiagnostics>, String> {
    let binary = resolve_rumdl_binary(&app).await?;
    cli::check_vault(&binary, Path::new(&vault_path))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn lint_format_vault(app: AppHandle, vault_path: String) -> Result<Vec<String>, String> {
    let binary = resolve_rumdl_binary(&app).await?;
    cli::format_vault(&binary, Path::new(&vault_path))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn lint_get_status(
    state: State<'_, LintState>,
    vault_id: String,
) -> Result<LintStatus, String> {
    Ok(state.get_status(&vault_id).await)
}
