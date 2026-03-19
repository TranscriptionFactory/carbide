pub mod service;
pub mod settings;
pub mod types;

use std::path::Path;
use tauri::{command, State};
use crate::features::plugin::service::PluginService;
use crate::features::plugin::types::PluginInfo;
use crate::features::plugin::settings::PluginSettings;

#[command]
pub async fn plugin_discover(
    vault_path: String,
    state: State<'_, PluginService>,
) -> Result<Vec<PluginInfo>, String> {
    state.discover(Path::new(&vault_path)).map_err(|e| e.to_string())
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
