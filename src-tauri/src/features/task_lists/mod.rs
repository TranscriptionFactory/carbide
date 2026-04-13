use crate::shared::io_utils;
use crate::shared::storage;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize, Type, Clone)]
pub struct TaskListItem {
    pub id: String,
    pub text: String,
    pub status: String,
    pub due_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type, Clone)]
pub struct TaskList {
    pub name: String,
    pub items: Vec<TaskListItem>,
    pub created_at: String,
    pub updated_at: String,
}

fn task_lists_dir(app: &AppHandle, vault_id: &str) -> Result<PathBuf, String> {
    let root = storage::vault_path(app, vault_id)?;
    Ok(root.join(".carbide").join("task_lists"))
}

fn task_list_path(app: &AppHandle, vault_id: &str, name: &str) -> Result<PathBuf, String> {
    let dir = task_lists_dir(app, vault_id)?;
    let slug = slugify(name);
    if slug.is_empty() {
        return Err("Invalid task list name".into());
    }
    Ok(dir.join(format!("{}.tasks.json", slug)))
}

fn slugify(name: &str) -> String {
    let s: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    let trimmed = s.trim_matches('-').to_string();
    trimmed.chars().take(64).collect()
}

#[tauri::command]
#[specta::specta]
pub fn task_list_list(app: AppHandle, vault_id: String) -> Result<Vec<String>, String> {
    let dir = task_lists_dir(&app, &vault_id)?;
    if !dir.is_dir() {
        return Ok(vec![]);
    }

    let mut names = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        if !file_name.ends_with(".tasks.json") {
            continue;
        }
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(list) = serde_json::from_str::<TaskList>(&content) {
                names.push(list.name);
            }
        }
    }

    names.sort();
    Ok(names)
}

#[tauri::command]
#[specta::specta]
pub fn task_list_read(
    app: AppHandle,
    vault_id: String,
    name: String,
) -> Result<TaskList, String> {
    let path = task_list_path(&app, &vault_id, &name)?;
    if !path.is_file() {
        return Err(format!("Task list '{}' not found", name));
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn task_list_write(
    app: AppHandle,
    vault_id: String,
    name: String,
    data: TaskList,
) -> Result<(), String> {
    let path = task_list_path(&app, &vault_id, &name)?;
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    io_utils::atomic_write(&path, json.as_bytes())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn task_list_delete(
    app: AppHandle,
    vault_id: String,
    name: String,
) -> Result<(), String> {
    let path = task_list_path(&app, &vault_id, &name)?;
    if path.is_file() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
