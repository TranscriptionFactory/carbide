use std::collections::HashMap;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

use super::downloader;
use super::registry;
use super::resolver;
use super::types::*;

pub struct ToolchainState {
    pub statuses: Mutex<HashMap<String, ToolStatus>>,
}

impl Default for ToolchainState {
    fn default() -> Self {
        Self {
            statuses: Mutex::new(HashMap::new()),
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn toolchain_list_tools(
    app: AppHandle,
    state: State<'_, ToolchainState>,
) -> Result<Vec<ToolInfo>, String> {
    let cached: HashMap<String, ToolStatus> = state.statuses.lock().await.clone();
    let mut tools = Vec::new();

    for spec in registry::TOOLS {
        let status = match cached.get(spec.id) {
            Some(s) => s.clone(),
            None => match resolver::resolve(&app, spec.id, None).await {
                Ok(path) => ToolStatus::Installed {
                    version: spec.version.to_string(),
                    path: path.to_string_lossy().to_string(),
                },
                Err(_) => ToolStatus::NotInstalled,
            },
        };

        tools.push(ToolInfo {
            id: spec.id.to_string(),
            display_name: spec.display_name.to_string(),
            github_repo: spec.github_repo.to_string(),
            version: spec.version.to_string(),
            status,
            capabilities: spec.capabilities.to_vec(),
        });
    }

    Ok(tools)
}

#[tauri::command]
#[specta::specta]
pub async fn toolchain_install(
    app: AppHandle,
    state: State<'_, ToolchainState>,
    tool_id: String,
) -> Result<(), String> {
    {
        let mut statuses = state.statuses.lock().await;
        statuses.insert(tool_id.clone(), ToolStatus::Downloading { percent: 0.0 });
    }

    match downloader::download_tool(&app, &tool_id).await {
        Ok(path) => {
            let spec = registry::get(&tool_id).unwrap();
            let mut statuses = state.statuses.lock().await;
            statuses.insert(
                tool_id,
                ToolStatus::Installed {
                    version: spec.version.to_string(),
                    path: path.to_string_lossy().to_string(),
                },
            );
            Ok(())
        }
        Err(e) => {
            let mut statuses = state.statuses.lock().await;
            statuses.insert(tool_id.clone(), ToolStatus::Error { message: e.clone() });
            let _ = app.emit(
                "toolchain_event",
                ToolchainEvent::InstallFailed {
                    tool_id,
                    message: e.clone(),
                },
            );
            Err(e)
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn toolchain_uninstall(
    app: AppHandle,
    state: State<'_, ToolchainState>,
    tool_id: String,
) -> Result<(), String> {
    let spec = registry::get(&tool_id).ok_or_else(|| format!("Unknown tool: {}", tool_id))?;

    let path = resolver::downloaded_path(&app, &tool_id, spec.version, spec.binary_name)?;

    if path.exists() {
        tokio::fs::remove_file(&path)
            .await
            .map_err(|e| format!("Failed to remove binary: {}", e))?;

        if let Some(parent) = path.parent() {
            let _ = tokio::fs::remove_dir(parent).await;
            if let Some(grandparent) = parent.parent() {
                let _ = tokio::fs::remove_dir(grandparent).await;
            }
        }
    }

    let mut statuses = state.statuses.lock().await;
    statuses.insert(tool_id, ToolStatus::NotInstalled);

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn toolchain_resolve(
    app: AppHandle,
    state: State<'_, ToolchainState>,
    tool_id: String,
    custom_path: Option<String>,
) -> Result<String, String> {
    let path = resolver::resolve(&app, &tool_id, custom_path.as_deref()).await?;
    let spec = registry::get(&tool_id).unwrap();
    let mut statuses = state.statuses.lock().await;
    statuses.insert(
        tool_id,
        ToolStatus::Installed {
            version: spec.version.to_string(),
            path: path.to_string_lossy().to_string(),
        },
    );
    Ok(path.to_string_lossy().to_string())
}
