use crate::shared::constants;
use crate::shared::io_utils;
use crate::shared::storage::{load_store, vault_mode_for_id, vault_path_by_id, VaultMode};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";

static VAULT_SETTINGS_LOCK: Mutex<()> = Mutex::new(());
static LOCAL_SETTINGS_LOCK: Mutex<()> = Mutex::new(());

fn vault_settings_dir(app: &AppHandle, vault_id: &str) -> Result<PathBuf, String> {
    let store = load_store(app)?;
    let vault_path = vault_path_by_id(&store, vault_id).ok_or("Vault not found")?;
    Ok(PathBuf::from(&vault_path).join(constants::APP_DIR))
}

fn vault_settings_path_for_read(
    app: &AppHandle,
    vault_id: &str,
) -> Result<Option<PathBuf>, String> {
    let settings_dir = vault_settings_dir(app, vault_id)?;
    if !settings_dir.is_dir() {
        return Ok(None);
    }
    Ok(Some(settings_dir.join(SETTINGS_FILE)))
}

fn vault_settings_path_for_write(app: &AppHandle, vault_id: &str) -> Result<PathBuf, String> {
    let settings_dir = vault_settings_dir(app, vault_id)?;
    std::fs::create_dir_all(&settings_dir).map_err(|e| e.to_string())?;
    Ok(settings_dir.join(SETTINGS_FILE))
}

fn local_state_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .home_dir()
        .map_err(|e| e.to_string())?
        .join(".carbide")
        .join("local_state"))
}

fn local_state_path_for_read(app: &AppHandle, vault_id: &str) -> Result<Option<PathBuf>, String> {
    let dir = local_state_dir(app)?;
    if !dir.is_dir() {
        return Ok(None);
    }
    Ok(Some(dir.join(format!("{}.json", vault_id))))
}

fn local_state_path_for_write(app: &AppHandle, vault_id: &str) -> Result<PathBuf, String> {
    let dir = local_state_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{}.json", vault_id)))
}

fn load_vault_settings(app: &AppHandle, vault_id: &str) -> Result<HashMap<String, Value>, String> {
    let Some(path) = vault_settings_path_for_read(app, vault_id)? else {
        return Ok(HashMap::new());
    };
    let Some(bytes) = read_settings_file(&path)? else {
        return Ok(HashMap::new());
    };
    parse_settings(&bytes, "Vault")
}

fn load_local_settings(app: &AppHandle, vault_id: &str) -> Result<HashMap<String, Value>, String> {
    let Some(path) = local_state_path_for_read(app, vault_id)? else {
        return Ok(HashMap::new());
    };
    let Some(bytes) = read_settings_file(&path)? else {
        return Ok(HashMap::new());
    };
    parse_settings(&bytes, "Local")
}

pub(crate) fn parse_settings(bytes: &[u8], label: &str) -> Result<HashMap<String, Value>, String> {
    let mut stream = serde_json::Deserializer::from_slice(bytes).into_iter::<Value>();
    let first = stream
        .next()
        .ok_or_else(|| format!("{} settings: EOF while parsing a value", label))
        .and_then(|result| result.map_err(|e| e.to_string()))?;

    if stream.next().is_some() {
        log::warn!(
            "{} settings contained trailing content; ignoring trailing bytes",
            label
        );
    }

    let settings = first
        .as_object()
        .ok_or_else(|| format!("{} settings root must be a JSON object", label))?
        .iter()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect::<HashMap<String, Value>>();

    Ok(settings)
}

fn read_settings_file(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn write_settings_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    io_utils::atomic_write(path, bytes)
}

fn save_vault_settings(
    app: &AppHandle,
    vault_id: &str,
    settings: &HashMap<String, Value>,
) -> Result<(), String> {
    let path = vault_settings_path_for_write(app, vault_id)?;
    let bytes = serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?;
    write_settings_file(&path, &bytes)
}

fn save_local_settings(
    app: &AppHandle,
    vault_id: &str,
    settings: &HashMap<String, Value>,
) -> Result<(), String> {
    let path = local_state_path_for_write(app, vault_id)?;
    let bytes = serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?;
    write_settings_file(&path, &bytes)
}

/// Serializes the load/insert/save cycle over a settings file. These commands run
/// on the blocking pool and so interleave; without this the last writer silently
/// discards the other's key. Mirrors `storage::update_store`.
fn update_vault_settings<F>(app: &AppHandle, vault_id: &str, f: F) -> Result<(), String>
where
    F: FnOnce(&mut HashMap<String, Value>),
{
    let _guard = VAULT_SETTINGS_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut settings = load_vault_settings(app, vault_id)?;
    f(&mut settings);
    save_vault_settings(app, vault_id, &settings)
}

fn update_local_settings<F>(app: &AppHandle, vault_id: &str, f: F) -> Result<(), String>
where
    F: FnOnce(&mut HashMap<String, Value>),
{
    let _guard = LOCAL_SETTINGS_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut settings = load_local_settings(app, vault_id)?;
    f(&mut settings);
    save_local_settings(app, vault_id, &settings)
}

pub(crate) fn get_vault_setting_value(
    app: &AppHandle,
    vault_id: &str,
    key: &str,
) -> Result<Option<Value>, String> {
    let settings = load_vault_settings(app, vault_id)?;
    Ok(settings.get(key).cloned())
}

#[tauri::command]
pub async fn get_vault_setting(
    vault_id: String,
    key: String,
    app: AppHandle,
) -> Result<Option<Value>, String> {
    crate::shared::blocking::blocking("get_vault_setting", move || {
        get_vault_setting_inner(vault_id, key, app)
    })
    .await
}

pub fn get_vault_setting_inner(
    vault_id: String,
    key: String,
    app: AppHandle,
) -> Result<Option<Value>, String> {
    log::trace!("Getting vault setting vault_id={} key={}", vault_id, key);
    get_vault_setting_value(&app, &vault_id, &key)
}

#[tauri::command]
pub async fn set_vault_setting(
    vault_id: String,
    key: String,
    value: Value,
    app: AppHandle,
) -> Result<(), String> {
    crate::shared::blocking::blocking("set_vault_setting", move || {
        set_vault_setting_inner(vault_id, key, value, app)
    })
    .await
}

pub fn set_vault_setting_inner(
    vault_id: String,
    key: String,
    value: Value,
    app: AppHandle,
) -> Result<(), String> {
    log::trace!("Setting vault setting vault_id={} key={}", vault_id, key);
    if vault_mode_for_id(&app, &vault_id)? == VaultMode::Browse {
        log::debug!(
            "Skipping vault setting write in browse mode vault_id={}",
            vault_id
        );
        return Ok(());
    }
    update_vault_settings(&app, &vault_id, |settings| {
        settings.insert(key, value);
    })
}

#[tauri::command]
pub async fn get_local_setting(
    vault_id: String,
    key: String,
    app: AppHandle,
) -> Result<Option<Value>, String> {
    crate::shared::blocking::blocking("get_local_setting", move || {
        get_local_setting_inner(vault_id, key, app)
    })
    .await
}

pub fn get_local_setting_inner(
    vault_id: String,
    key: String,
    app: AppHandle,
) -> Result<Option<Value>, String> {
    log::trace!("Getting local setting vault_id={} key={}", vault_id, key);
    let settings = load_local_settings(&app, &vault_id)?;
    Ok(settings.get(&key).cloned())
}

#[tauri::command]
pub async fn set_local_setting(
    vault_id: String,
    key: String,
    value: Value,
    app: AppHandle,
) -> Result<(), String> {
    crate::shared::blocking::blocking("set_local_setting", move || {
        set_local_setting_inner(vault_id, key, value, app)
    })
    .await
}

pub fn set_local_setting_inner(
    vault_id: String,
    key: String,
    value: Value,
    app: AppHandle,
) -> Result<(), String> {
    log::trace!("Setting local setting vault_id={} key={}", vault_id, key);
    if vault_mode_for_id(&app, &vault_id)? == VaultMode::Browse {
        log::debug!(
            "Skipping local setting write in browse mode vault_id={}",
            vault_id
        );
        return Ok(());
    }
    update_local_settings(&app, &vault_id, |settings| {
        settings.insert(key, value);
    })
}
