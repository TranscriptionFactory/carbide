pub mod service;
pub mod types;

use std::path::Path;
use tauri::{command, State};
use crate::features::plugin::service::PluginService;
use crate::features::plugin::types::PluginManifest;

#[command]
pub async fn plugin_discover(
    vault_path: String,
    _state: State<'_, PluginService>,
) -> Result<Vec<PluginManifest>, String> {
    let service = PluginService::new();
    service.discover(Path::new(&vault_path)).map_err(|e| e.to_string())
}
