use crate::features::vault_settings::service::parse_settings;
use crate::shared::io_utils;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Manager};

static SETTINGS_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SettingsStore {
    pub settings: HashMap<String, Value>,
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let dir = dir.join("carbide");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

fn read_settings_file(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub fn load_settings(app: &AppHandle) -> Result<SettingsStore, String> {
    let path = settings_path(app)?;
    let Some(bytes) = read_settings_file(&path)? else {
        return Ok(SettingsStore::default());
    };

    let parsed = parse_settings(&bytes, "Global")?;

    // The file is stored as {"settings": {...}}, so unwrap the inner map.
    // Fall back to treating the parsed map as flat settings for resilience.
    let settings = match parsed.get("settings") {
        Some(Value::Object(inner)) => inner.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
        _ => parsed,
    };
    Ok(SettingsStore { settings })
}

pub fn save_settings(app: &AppHandle, store: &SettingsStore) -> Result<(), String> {
    let path = settings_path(app)?;
    let bytes = serde_json::to_vec_pretty(store).map_err(|e| e.to_string())?;
    io_utils::atomic_write(&path, &bytes)
}

#[tauri::command]
pub async fn get_setting(key: String, app: AppHandle) -> Result<Option<Value>, String> {
    log::debug!("Getting setting key={}", key);
    let store = load_settings(&app)?;
    Ok(store.settings.get(&key).cloned())
}

#[tauri::command]
pub async fn set_setting(key: String, value: Value, app: AppHandle) -> Result<(), String> {
    log::debug!("Setting key={}", key);
    let _guard = SETTINGS_LOCK.lock().map_err(|e| e.to_string())?;
    let mut store = load_settings(&app)?;
    store.settings.insert(key, value);
    save_settings(&app, &store)?;
    Ok(())
}
