use crate::features::notes::service as notes_service;
use crate::features::search::db as search_db;
use crate::features::search::model::{BaseQuery, BaseQueryResults, PropertyInfo};
use crate::features::search::service as search_service;
use crate::shared::storage;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct BaseViewDefinition {
    pub name: String,
    pub query: BaseQuery,
    pub view_mode: String, // "table", "list"
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct SavedViewInfo {
    pub name: String,
    pub path: String,
}

#[tauri::command]
#[specta::specta]
pub fn bases_list_properties(
    app: AppHandle,
    vault_id: String,
) -> Result<Vec<PropertyInfo>, String> {
    search_service::with_read_conn(&app, &vault_id, |conn| search_db::list_all_properties(conn))
}

#[tauri::command]
#[specta::specta]
pub fn bases_query(
    app: AppHandle,
    vault_id: String,
    query: BaseQuery,
) -> Result<BaseQueryResults, String> {
    search_service::with_read_conn(&app, &vault_id, |conn| search_db::query_bases(conn, query))
}

#[tauri::command]
#[specta::specta]
pub fn bases_save_view(
    app: AppHandle,
    vault_id: String,
    path: String,
    view: BaseViewDefinition,
) -> Result<(), String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let abs = notes_service::safe_vault_abs_for_write(&root, &path)?;

    let json = serde_json::to_string_pretty(&view).map_err(|e| e.to_string())?;

    crate::shared::io_utils::atomic_write(&abs, json.as_bytes())?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn bases_load_view(
    app: AppHandle,
    vault_id: String,
    path: String,
) -> Result<BaseViewDefinition, String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let abs = notes_service::safe_vault_abs(&root, &path)?;

    let content = std::fs::read_to_string(abs).map_err(|e| e.to_string())?;
    let view: BaseViewDefinition = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    Ok(view)
}

#[tauri::command]
#[specta::specta]
pub fn bases_list_views(app: AppHandle, vault_id: String) -> Result<Vec<SavedViewInfo>, String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let dir = root.join(".carbide").join("bases");
    if !dir.is_dir() {
        return Ok(vec![]);
    }

    let mut views = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(view) = serde_json::from_str::<BaseViewDefinition>(&content) {
                let rel = PathBuf::from(".carbide")
                    .join("bases")
                    .join(entry.file_name());
                views.push(SavedViewInfo {
                    name: view.name,
                    path: rel.to_string_lossy().into_owned(),
                });
            }
        }
    }

    Ok(views)
}

#[tauri::command]
#[specta::specta]
pub fn bases_delete_view(app: AppHandle, vault_id: String, path: String) -> Result<(), String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let abs = notes_service::safe_vault_abs(&root, &path)?;

    if abs.is_file() {
        std::fs::remove_file(abs).map_err(|e| e.to_string())?;
    }

    Ok(())
}
