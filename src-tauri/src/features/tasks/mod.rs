pub mod service;
pub mod types;

use crate::features::notes::service as notes_service;
use crate::features::search::db::open_search_db;
use crate::features::tasks::service::{
    get_tasks_for_path, query_tasks, update_task_due_date_in_file, update_task_state_in_file,
};
use crate::features::tasks::types::{Task, TaskDueDateUpdate, TaskQuery, TaskUpdate};
use crate::shared::io_utils;
use crate::shared::storage;
use tauri::{command, AppHandle};

#[command]
#[specta::specta]
pub fn tasks_query(
    app: AppHandle,
    vault_id: String,
    query: TaskQuery,
) -> Result<Vec<Task>, String> {
    let conn = open_search_db(&app, &vault_id)?;
    query_tasks(&conn, query)
}

#[command]
#[specta::specta]
pub fn tasks_get_for_note(
    app: AppHandle,
    vault_id: String,
    path: String,
) -> Result<Vec<Task>, String> {
    let conn = open_search_db(&app, &vault_id)?;
    get_tasks_for_path(&conn, &path)
}

#[command]
#[specta::specta]
pub fn tasks_update_state(
    app: AppHandle,
    vault_id: String,
    update: TaskUpdate,
) -> Result<(), String> {
    log::info!(
        "Updating task state for {} at line {} to status {:?}",
        update.path,
        update.line_number,
        update.status
    );
    let vault_root = storage::vault_path(&app, &vault_id)?;
    let abs_path = notes_service::safe_vault_abs(&vault_root, &update.path)?;

    update_task_state_in_file(&abs_path, update.line_number, update.status)?;

    // Re-index this file's tasks in the DB so the next query reflects the change
    let content = io_utils::read_file_to_string(&abs_path)?;
    let tasks = service::extract_tasks(&update.path, &content);
    let conn = open_search_db(&app, &vault_id)?;
    service::save_tasks(&conn, &update.path, &tasks)?;

    Ok(())
}

#[command]
#[specta::specta]
pub fn tasks_update_due_date(
    app: AppHandle,
    vault_id: String,
    update: TaskDueDateUpdate,
) -> Result<(), String> {
    log::info!(
        "Updating due date for {} at line {}",
        update.path,
        update.line_number,
    );
    let vault_root = storage::vault_path(&app, &vault_id)?;
    let abs_path = notes_service::safe_vault_abs(&vault_root, &update.path)?;

    update_task_due_date_in_file(&abs_path, update.line_number, update.new_due_date.as_deref())?;

    let content = io_utils::read_file_to_string(&abs_path)?;
    let tasks = service::extract_tasks(&update.path, &content);
    let conn = open_search_db(&app, &vault_id)?;
    service::save_tasks(&conn, &update.path, &tasks)?;

    Ok(())
}

#[command]
#[specta::specta]
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

    content.push_str(&format!("- [ ] {}\n", text));

    io_utils::atomic_write(&abs_path, content.as_bytes())?;

    let updated_content = io_utils::read_file_to_string(&abs_path)?;
    let tasks = service::extract_tasks(&path, &updated_content);
    let conn = open_search_db(&app, &vault_id)?;
    service::save_tasks(&conn, &path, &tasks)?;

    Ok(())
}
