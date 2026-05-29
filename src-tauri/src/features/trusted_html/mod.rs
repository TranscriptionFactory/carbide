use crate::shared::io_utils;
use crate::shared::storage;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const CONFIG_REL: &str = ".carbide/trusted_html.json";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Type)]
#[serde(rename_all = "lowercase")]
pub enum TrustLevel {
    Safe,
    Live,
    #[serde(rename = "live+net")]
    LiveNet,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Type)]
#[serde(rename_all = "lowercase")]
pub enum TrustScope {
    File,
    Folder,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TrustEntry {
    pub path: String,
    pub scope: TrustScope,
    pub level: TrustLevel,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct StoredTrustGrants {
    files: HashMap<String, TrustLevel>,
    folders: HashMap<String, TrustLevel>,
}

fn config_path(vault_root: &Path) -> PathBuf {
    vault_root.join(CONFIG_REL)
}

fn load(vault_root: &Path) -> Result<StoredTrustGrants, String> {
    let path = config_path(vault_root);
    if !path.is_file() {
        return Ok(StoredTrustGrants::default());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn save(vault_root: &Path, grants: &StoredTrustGrants) -> Result<(), String> {
    let path = config_path(vault_root);
    let json = serde_json::to_string_pretty(grants).map_err(|e| e.to_string())?;
    io_utils::atomic_write(&path, json.as_bytes())
}

fn normalize(path: &str) -> String {
    path.trim_matches('/').to_string()
}

fn parent_folder(rel_path: &str) -> String {
    let n = normalize(rel_path);
    match n.rfind('/') {
        Some(i) => n[..i].to_string(),
        None => String::new(),
    }
}

fn ancestor_chain(rel_path: &str) -> Vec<String> {
    let n = normalize(rel_path);
    let parts: Vec<&str> = n.split('/').collect();
    let mut out = Vec::with_capacity(parts.len());
    for i in (0..parts.len()).rev() {
        out.push(parts[..i].join("/"));
    }
    out
}

fn resolve(grants: &StoredTrustGrants, file_path: &str) -> TrustLevel {
    let n = normalize(file_path);
    if let Some(level) = grants.files.get(&n) {
        return *level;
    }
    for ancestor in ancestor_chain(&n) {
        if let Some(level) = grants.folders.get(&ancestor) {
            return *level;
        }
    }
    TrustLevel::Safe
}

#[tauri::command]
#[specta::specta]
pub fn trusted_html_get_level(
    app: AppHandle,
    vault_id: String,
    file_path: String,
) -> Result<TrustLevel, String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let grants = load(&root)?;
    Ok(resolve(&grants, &file_path))
}

#[tauri::command]
#[specta::specta]
pub fn trusted_html_list(
    app: AppHandle,
    vault_id: String,
) -> Result<Vec<TrustEntry>, String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let grants = load(&root)?;
    let mut out: Vec<TrustEntry> = Vec::new();
    for (path, level) in grants.files.iter() {
        out.push(TrustEntry {
            path: path.clone(),
            scope: TrustScope::File,
            level: *level,
        });
    }
    for (path, level) in grants.folders.iter() {
        out.push(TrustEntry {
            path: path.clone(),
            scope: TrustScope::Folder,
            level: *level,
        });
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

#[tauri::command]
#[specta::specta]
pub fn trusted_html_grant(
    app: AppHandle,
    vault_id: String,
    path: String,
    scope: TrustScope,
    level: TrustLevel,
) -> Result<(), String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let mut grants = load(&root)?;
    let key = normalize(&path);
    match scope {
        TrustScope::File => {
            if level == TrustLevel::Safe {
                grants.files.remove(&key);
            } else {
                grants.files.insert(key, level);
            }
        }
        TrustScope::Folder => {
            if level == TrustLevel::Safe {
                grants.folders.remove(&key);
            } else {
                grants.folders.insert(key, level);
            }
        }
    }
    save(&root, &grants)
}

#[tauri::command]
#[specta::specta]
pub fn trusted_html_revoke(
    app: AppHandle,
    vault_id: String,
    path: String,
    scope: TrustScope,
) -> Result<(), String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let mut grants = load(&root)?;
    let key = normalize(&path);
    match scope {
        TrustScope::File => {
            grants.files.remove(&key);
        }
        TrustScope::Folder => {
            grants.folders.remove(&key);
        }
    }
    save(&root, &grants)
}

#[tauri::command]
#[specta::specta]
pub fn trusted_html_parent_folder(file_path: String) -> Result<String, String> {
    Ok(parent_folder(&file_path))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grants_with_file(path: &str, level: TrustLevel) -> StoredTrustGrants {
        let mut g = StoredTrustGrants::default();
        g.files.insert(path.to_string(), level);
        g
    }

    fn grants_with_folder(path: &str, level: TrustLevel) -> StoredTrustGrants {
        let mut g = StoredTrustGrants::default();
        g.folders.insert(path.to_string(), level);
        g
    }

    #[test]
    fn defaults_to_safe() {
        let g = StoredTrustGrants::default();
        assert_eq!(resolve(&g, "notes/chart.html"), TrustLevel::Safe);
    }

    #[test]
    fn file_grant_resolves() {
        let g = grants_with_file("notes/chart.html", TrustLevel::Live);
        assert_eq!(resolve(&g, "notes/chart.html"), TrustLevel::Live);
    }

    #[test]
    fn folder_grant_propagates_to_descendants() {
        let g = grants_with_folder("notes", TrustLevel::LiveNet);
        assert_eq!(resolve(&g, "notes/chart.html"), TrustLevel::LiveNet);
        assert_eq!(
            resolve(&g, "notes/sub/deep.html"),
            TrustLevel::LiveNet
        );
    }

    #[test]
    fn file_grant_overrides_folder_grant() {
        let mut g = grants_with_folder("notes", TrustLevel::LiveNet);
        g.files
            .insert("notes/chart.html".to_string(), TrustLevel::Live);
        assert_eq!(resolve(&g, "notes/chart.html"), TrustLevel::Live);
        assert_eq!(
            resolve(&g, "notes/other.html"),
            TrustLevel::LiveNet
        );
    }

    #[test]
    fn folder_grant_does_not_match_sibling() {
        let g = grants_with_folder("notes", TrustLevel::Live);
        assert_eq!(
            resolve(&g, "other/chart.html"),
            TrustLevel::Safe
        );
    }

    #[test]
    fn parent_folder_strips_filename() {
        assert_eq!(parent_folder("notes/sub/chart.html"), "notes/sub");
        assert_eq!(parent_folder("chart.html"), "");
        assert_eq!(parent_folder("/notes/chart.html"), "notes");
    }

    #[test]
    fn leading_slash_is_normalized() {
        let g = grants_with_file("notes/chart.html", TrustLevel::Live);
        assert_eq!(resolve(&g, "/notes/chart.html"), TrustLevel::Live);
    }
}
