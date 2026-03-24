use crate::shared::io_utils;
use crate::shared::storage;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;

const LIBRARY_RELATIVE_PATH: &str = ".carbide/references/library.json";
const CURRENT_SCHEMA_VERSION: u64 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReferenceLibrary {
    pub schema_version: u64,
    pub items: Vec<serde_json::Value>,
}

impl Default for ReferenceLibrary {
    fn default() -> Self {
        Self {
            schema_version: CURRENT_SCHEMA_VERSION,
            items: Vec::new(),
        }
    }
}

fn library_path(app: &AppHandle, vault_id: &str) -> Result<PathBuf, String> {
    let root = storage::vault_path(app, vault_id)?;
    Ok(root.join(LIBRARY_RELATIVE_PATH))
}

fn read_library(app: &AppHandle, vault_id: &str) -> Result<ReferenceLibrary, String> {
    let path = library_path(app, vault_id)?;
    match std::fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| {
            format!("failed to parse reference library: {e}")
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(ReferenceLibrary::default()),
        Err(e) => Err(e.to_string()),
    }
}

fn write_library(app: &AppHandle, vault_id: &str, library: &ReferenceLibrary) -> Result<(), String> {
    let path = library_path(app, vault_id)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(library).map_err(|e| e.to_string())?;
    io_utils::atomic_write(&path, &bytes)
}

fn item_citekey(item: &serde_json::Value) -> Option<&str> {
    item.get("id").and_then(|v| v.as_str())
}

#[tauri::command]
#[specta::specta]
pub fn reference_load_library(
    app: AppHandle,
    vault_id: String,
) -> Result<ReferenceLibrary, String> {
    read_library(&app, &vault_id)
}

#[tauri::command]
#[specta::specta]
pub fn reference_save_library(
    app: AppHandle,
    vault_id: String,
    library: ReferenceLibrary,
) -> Result<(), String> {
    write_library(&app, &vault_id, &library)
}

#[tauri::command]
#[specta::specta]
pub fn reference_add_item(
    app: AppHandle,
    vault_id: String,
    item: serde_json::Value,
) -> Result<ReferenceLibrary, String> {
    let citekey = item_citekey(&item)
        .ok_or("item must have an 'id' field")?
        .to_string();

    let mut library = read_library(&app, &vault_id)?;

    if let Some(pos) = library.items.iter().position(|i| {
        item_citekey(i).map_or(false, |k| k == citekey)
    }) {
        library.items[pos] = item;
    } else {
        library.items.push(item);
    }

    write_library(&app, &vault_id, &library)?;
    Ok(library)
}

#[tauri::command]
#[specta::specta]
pub fn reference_remove_item(
    app: AppHandle,
    vault_id: String,
    citekey: String,
) -> Result<ReferenceLibrary, String> {
    let mut library = read_library(&app, &vault_id)?;
    library.items.retain(|i| {
        item_citekey(i).map_or(true, |k| k != citekey)
    });
    write_library(&app, &vault_id, &library)?;
    Ok(library)
}
