pub mod types;
pub mod service;

use tauri::{AppHandle, command};
use crate::features::tasks::types::{Task, TaskUpdate};
use crate::features::search::db::open_search_db;
use crate::shared::storage;
use crate::shared::io_utils;
use crate::features::notes::service as notes_service;
use crate::features::tasks::service::{query_tasks, get_tasks_for_path, update_task_state_in_file};

#[command]
pub fn tasks_query(
    app: AppHandle,
    vault_id: String,
    completed: Option<bool>,
) -> Result<Vec<Task>, String> {
    let conn = open_search_db(&app, &vault_id)?;
    query_tasks(&conn, completed)
}

#[command]
pub fn tasks_get_for_note(
    app: AppHandle,
    vault_id: String,
    path: String,
) -> Result<Vec<Task>, String> {
    let conn = open_search_db(&app, &vault_id)?;
    get_tasks_for_path(&conn, &path)
}

#[command]
pub fn tasks_update_state(
    app: AppHandle,
    vault_id: String,
    update: TaskUpdate,
) -> Result<(), String> {
    log::info!("Updating task state for {} at line {}", update.path, update.line_number);
    let vault_root = storage::vault_path(&app, &vault_id)?;
    let abs_path = notes_service::safe_vault_abs(&vault_root, &update.path)?;
    
    update_task_state_in_file(&abs_path, update.line_number, update.completed)
}

#[command]
pub fn tasks_create(
    app: AppHandle,
    vault_id: String,
    path: String,
    text: String,
) -> Result<(), String> {
    log::info!("Creating task in {}: {}", path, text);
    let vault_root = storage::vault_path(&app, &vault_id)?;
    let abs_path = notes_service::safe_vault_abs_for_write(&vault_root, &path)?;
    
    let mut content = if abs_path.exists() {
        io_utils::read_file_to_string(&abs_path)?
    } else {
        String::new()
    };

    if !content.is_empty() && !content.ends_with('\n') {
        content.push('\n');
    }
    
    // Add task at the end of the file for now
    content.push_str(&format!("- [ ] {}\n", text));
    
    io_utils::atomic_write(&abs_path, content.as_bytes())
}
