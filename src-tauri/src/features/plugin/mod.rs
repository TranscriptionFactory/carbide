pub mod http_fetch;
pub mod service;
pub mod settings;
pub mod types;
pub mod watcher;

use crate::features::plugin::service::{install_bundled_plugins, PluginService};
use crate::features::plugin::settings::PluginSettings;
use crate::features::plugin::types::PluginInfo;
use std::path::Path;
use tauri::{command, AppHandle, Manager, State};
use tauri::path::BaseDirectory;

fn resolve_home_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().home_dir().map_err(|e| e.to_string())
}

#[command]
pub async fn plugin_install_bundled(app: AppHandle) -> Result<Vec<String>, String> {
    let resource_dir = app
        .path()
        .resolve("", BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let home_dir = resolve_home_dir(&app)?;
    install_bundled_plugins(&resource_dir, &home_dir).map_err(|e| e.to_string())
}

#[command]
pub async fn plugin_discover(
    app: AppHandle,
    vault_path: String,
    state: State<'_, PluginService>,
) -> Result<Vec<PluginInfo>, String> {
    let home_dir = resolve_home_dir(&app)?;
    state
        .discover(Path::new(&vault_path), &home_dir)
        .map_err(|e| e.to_string())
}

#[command]
pub async fn plugin_load(
    app: AppHandle,
    vault_path: String,
    plugin_id: String,
    state: State<'_, PluginService>,
) -> Result<PluginInfo, String> {
    let home_dir = resolve_home_dir(&app)?;
    state
        .validate_plugin(Path::new(&vault_path), &home_dir, &plugin_id)
        .map_err(|e| e.to_string())
}

#[command]
pub async fn plugin_unload(plugin_id: String) -> Result<(), String> {
    log::info!("Plugin unloaded: {}", plugin_id);
    Ok(())
}

#[command]
pub async fn plugin_read_settings(vault_path: String) -> Result<PluginSettings, String> {
    settings::read_settings(Path::new(&vault_path))
}

#[command]
pub async fn plugin_write_settings(
    vault_path: String,
    settings: PluginSettings,
) -> Result<(), String> {
    settings::write_settings(Path::new(&vault_path), &settings)
}

#[command]
pub async fn plugin_approve_permission(
    vault_path: String,
    plugin_id: String,
    permission: String,
) -> Result<(), String> {
    settings::approve_permission(Path::new(&vault_path), &plugin_id, &permission)
}

#[command]
pub async fn plugin_deny_permission(
    vault_path: String,
    plugin_id: String,
    permission: String,
) -> Result<(), String> {
    settings::deny_permission(Path::new(&vault_path), &plugin_id, &permission)
}
