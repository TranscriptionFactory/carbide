use crate::features::notes::service as notes_service;
use crate::features::search::db as search_db;
use crate::features::search::model::{BaseQuery, BaseQueryResults, PropertyInfo};
use crate::features::search::service as search_service;
use crate::shared::storage;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::io::Write;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct BaseViewDefinition {
    pub name: String,
    pub query: BaseQuery,
    pub view_mode: String, // "table", "list"
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

    let mut file = std::fs::File::create(abs).map_err(|e| e.to_string())?;
    file.write_all(json.as_bytes()).map_err(|e| e.to_string())?;

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
