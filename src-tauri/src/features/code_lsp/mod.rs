pub mod language_config;
pub mod manager;
pub mod types;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, State};
use tokio::sync::Mutex;

use manager::CodeLspManager;
use types::CodeLspStatus;

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
