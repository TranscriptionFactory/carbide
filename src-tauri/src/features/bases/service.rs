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

#[tauri::command]
#[specta::specta]
pub fn bases_update_property(
    app: AppHandle,
    vault_id: String,
    note_path: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let abs = notes_service::safe_vault_abs_for_write(&root, &note_path)?;
    let content = crate::shared::io_utils::read_file_to_string(&abs)?;

    let updated = update_frontmatter_key(&content, &key, &value)?;
    crate::shared::io_utils::atomic_write(&abs, updated.as_bytes())?;

    search_service::index_upsert_note_with_content(&app, &vault_id, &note_path, updated)?;

    Ok(())
}

fn update_frontmatter_key(markdown: &str, key: &str, value: &str) -> Result<String, String> {
    let lines: Vec<&str> = markdown.lines().collect();
    if lines.is_empty() || lines[0].trim() != "---" {
        return Err("Note has no frontmatter block".to_string());
    }

    let end_idx = lines
        .iter()
        .enumerate()
        .skip(1)
        .find(|(_, l)| l.trim() == "---")
        .map(|(i, _)| i)
        .ok_or("Malformed frontmatter: no closing ---")?;

    let key_prefix = format!("{}:", key);
    let trailing_newline = markdown.ends_with('\n');

    for i in 1..end_idx {
        if lines[i].starts_with(&key_prefix) {
            let indent = &lines[i][..lines[i].len() - lines[i].trim_start().len()];
            let new_line = format!("{}{}: {}", indent, key, value);
            // Skip any continuation lines (array items)
            let mut skip_end = i + 1;
            while skip_end < end_idx
                && (lines[skip_end].starts_with("  - ") || lines[skip_end].starts_with("\t- "))
            {
                skip_end += 1;
            }
            let mut out: Vec<String> = lines[..i].iter().map(|s| s.to_string()).collect();
            out.push(new_line);
            out.extend(lines[skip_end..].iter().map(|s| s.to_string()));
            let mut result = out.join("\n");
            if trailing_newline && !result.ends_with('\n') {
                result.push('\n');
            }
            return Ok(result);
        }
    }

    // Key doesn't exist — insert before closing ---
    let new_line = format!("{}: {}", key, value);
    let mut out: Vec<String> = lines[..end_idx].iter().map(|s| s.to_string()).collect();
    out.push(new_line);
    out.extend(lines[end_idx..].iter().map(|s| s.to_string()));
    let mut result = out.join("\n");
    if trailing_newline && !result.ends_with('\n') {
        result.push('\n');
    }
    Ok(result)
}
