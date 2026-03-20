use crate::shared::io_utils;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PluginSettings {
    pub plugins: HashMap<String, PluginSettingsEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginSettingsEntry {
    pub permissions_granted: Vec<String>,
    pub permissions_pending: Vec<String>,
    pub settings: serde_json::Value,
    pub content_hash: Option<String>,
}

impl Default for PluginSettingsEntry {
    fn default() -> Self {
        Self {
            permissions_granted: Vec::new(),
            permissions_pending: Vec::new(),
            settings: serde_json::Value::Object(serde_json::Map::new()),
            content_hash: None,
        }
    }
}

fn settings_path(vault_path: &Path) -> PathBuf {
    vault_path.join(".badgerly").join("plugin_settings.json")
}

pub fn read_settings(vault_path: &Path) -> Result<PluginSettings, String> {
    let path = settings_path(vault_path);
    if !path.exists() {
        return Ok(PluginSettings::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

pub fn write_settings(vault_path: &Path, settings: &PluginSettings) -> Result<(), String> {
    let path = settings_path(vault_path);
    let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    io_utils::atomic_write(&path, content)
}

pub fn approve_permission(
    vault_path: &Path,
    plugin_id: &str,
    permission: &str,
) -> Result<(), String> {
    let mut settings = read_settings(vault_path)?;
    let entry = settings.plugins.entry(plugin_id.to_string()).or_default();

    entry.permissions_pending.retain(|p| p != permission);
    if !entry.permissions_granted.contains(&permission.to_string()) {
        entry.permissions_granted.push(permission.to_string());
    }

    write_settings(vault_path, &settings)
}

pub fn deny_permission(vault_path: &Path, plugin_id: &str, permission: &str) -> Result<(), String> {
    let mut settings = read_settings(vault_path)?;
    let entry = settings.plugins.entry(plugin_id.to_string()).or_default();

    entry.permissions_pending.retain(|p| p != permission);

    write_settings(vault_path, &settings)
}
