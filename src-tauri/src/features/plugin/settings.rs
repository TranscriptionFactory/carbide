use crate::shared::io_utils;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const PLUGIN_SETTINGS_SCHEMA_VERSION: u32 = 1;

fn default_schema_version() -> u32 {
    PLUGIN_SETTINGS_SCHEMA_VERSION
}

fn default_plugin_source() -> String {
    "local".to_string()
}

fn empty_settings_object() -> serde_json::Value {
    serde_json::Value::Object(serde_json::Map::new())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct PluginSettings {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub plugins: HashMap<String, PluginSettingsEntry>,
}

impl Default for PluginSettings {
    fn default() -> Self {
        Self {
            schema_version: default_schema_version(),
            plugins: HashMap::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct PluginSettingsEntry {
    pub enabled: bool,
    pub version: String,
    #[serde(default = "default_plugin_source")]
    pub source: String,
    pub permissions_granted: Vec<String>,
    pub permissions_pending: Vec<String>,
    #[serde(default = "empty_settings_object")]
    pub settings: serde_json::Value,
    pub content_hash: Option<String>,
}

impl Default for PluginSettingsEntry {
    fn default() -> Self {
        Self {
            enabled: false,
            version: String::new(),
            source: default_plugin_source(),
            permissions_granted: Vec::new(),
            permissions_pending: Vec::new(),
            settings: empty_settings_object(),
            content_hash: None,
        }
    }
}

fn settings_path(vault_path: &Path) -> PathBuf {
    vault_path.join(".carbide").join("plugin_settings.json")
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

#[cfg(test)]
mod tests {
    use super::{
        read_settings, write_settings, PluginSettings, PluginSettingsEntry,
        PLUGIN_SETTINGS_SCHEMA_VERSION,
    };
    use serde_json::json;
    use std::fs;
    use tempfile::TempDir;

    fn write_raw_settings(vault_root: &TempDir, content: &str) {
        let settings_dir = vault_root.path().join(".carbide");
        fs::create_dir_all(&settings_dir).unwrap();
        fs::write(settings_dir.join("plugin_settings.json"), content).unwrap();
    }

    #[test]
    fn read_settings_returns_documented_defaults_when_file_missing() {
        let vault_root = TempDir::new().unwrap();

        let settings = read_settings(vault_root.path()).unwrap();

        assert_eq!(settings.schema_version, PLUGIN_SETTINGS_SCHEMA_VERSION);
        assert!(settings.plugins.is_empty());
    }

    #[test]
    fn write_settings_uses_carbide_path_and_expanded_shape() {
        let vault_root = TempDir::new().unwrap();
        let mut settings = PluginSettings::default();
        settings.plugins.insert(
            "plugin-a".to_string(),
            PluginSettingsEntry {
                enabled: true,
                version: "1.2.3".to_string(),
                source: "local".to_string(),
                permissions_granted: vec!["fs:read".to_string()],
                permissions_pending: vec!["fs:write".to_string()],
                settings: json!({ "theme": "dark" }),
                content_hash: Some("sha256:test".to_string()),
            },
        );

        write_settings(vault_root.path(), &settings).unwrap();

        let written = fs::read_to_string(
            vault_root
                .path()
                .join(".carbide")
                .join("plugin_settings.json"),
        )
        .unwrap();
        let json: serde_json::Value = serde_json::from_str(&written).unwrap();

        assert_eq!(
            json["schema_version"],
            serde_json::Value::from(PLUGIN_SETTINGS_SCHEMA_VERSION)
        );
        assert_eq!(json["plugins"]["plugin-a"]["enabled"], json!(true));
        assert_eq!(json["plugins"]["plugin-a"]["version"], json!("1.2.3"));
        assert_eq!(json["plugins"]["plugin-a"]["source"], json!("local"));
    }

    #[test]
    fn read_settings_migrates_legacy_entries_with_missing_fields() {
        let vault_root = TempDir::new().unwrap();
        write_raw_settings(
            &vault_root,
            r#"{
  "plugins": {
    "plugin-a": {
      "permissions_granted": ["fs:read"],
      "settings": { "theme": "dark" },
      "content_hash": null
    }
  }
}"#,
        );

        let settings = read_settings(vault_root.path()).unwrap();
        let entry = settings.plugins.get("plugin-a").unwrap();

        assert_eq!(settings.schema_version, PLUGIN_SETTINGS_SCHEMA_VERSION);
        assert!(!entry.enabled);
        assert_eq!(entry.version, "");
        assert_eq!(entry.source, "local");
        assert_eq!(entry.permissions_granted, vec!["fs:read"]);
        assert!(entry.permissions_pending.is_empty());
        assert_eq!(entry.settings["theme"], json!("dark"));
    }
}
