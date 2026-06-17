use crate::shared::io_utils;
use crate::shared::storage;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const CONFIG_REL: &str = ".carbide/reading_positions.json";

#[derive(Debug, Default, Serialize, Deserialize)]
struct StoredPositions {
    positions: HashMap<String, String>,
}

fn config_path(vault_root: &Path) -> PathBuf {
    vault_root.join(CONFIG_REL)
}

fn load(vault_root: &Path) -> Result<StoredPositions, String> {
    let path = config_path(vault_root);
    if !path.is_file() {
        return Ok(StoredPositions::default());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn save(vault_root: &Path, positions: &StoredPositions) -> Result<(), String> {
    let path = config_path(vault_root);
    let json = serde_json::to_string_pretty(positions).map_err(|e| e.to_string())?;
    io_utils::atomic_write(&path, json.as_bytes())
}

fn normalize(path: &str) -> String {
    path.trim_matches('/').to_string()
}

#[tauri::command]
#[specta::specta]
pub fn reading_position_get(
    app: AppHandle,
    vault_id: String,
    path: String,
) -> Result<Option<String>, String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let positions = load(&root)?;
    Ok(positions.positions.get(&normalize(&path)).cloned())
}

#[tauri::command]
#[specta::specta]
pub fn reading_position_set(
    app: AppHandle,
    vault_id: String,
    path: String,
    cfi: String,
) -> Result<(), String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let mut positions = load(&root)?;
    let key = normalize(&path);
    if cfi.is_empty() {
        positions.positions.remove(&key);
    } else {
        positions.positions.insert(key, cfi);
    }
    save(&root, &positions)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn positions_with(path: &str, cfi: &str) -> StoredPositions {
        let mut p = StoredPositions::default();
        p.positions.insert(path.to_string(), cfi.to_string());
        p
    }

    #[test]
    fn missing_path_returns_none() {
        let p = StoredPositions::default();
        assert_eq!(p.positions.get("books/a.epub"), None);
    }

    #[test]
    fn stored_position_round_trips() {
        let p = positions_with("books/a.epub", "epubcfi(/6/4!/4/2)");
        assert_eq!(
            p.positions.get("books/a.epub").map(String::as_str),
            Some("epubcfi(/6/4!/4/2)")
        );
    }

    #[test]
    fn leading_slash_is_normalized() {
        assert_eq!(normalize("/books/a.epub"), "books/a.epub");
        assert_eq!(normalize("books/a.epub"), "books/a.epub");
    }
}
