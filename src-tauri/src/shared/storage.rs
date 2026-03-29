use crate::shared::io_utils;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::http::{Request, Response};
use tauri::{AppHandle, Manager};

fn default_is_available() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum VaultMode {
    Vault,
    Browse,
}

impl Default for VaultMode {
    fn default() -> Self {
        VaultMode::Vault
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Vault {
    pub id: String,
    pub path: String,
    pub name: String,
    pub created_at: i64,
    #[serde(default)]
    pub last_opened_at: Option<i64>,
    #[serde(default)]
    pub note_count: Option<u64>,
    #[serde(default = "default_is_available")]
    pub is_available: bool,
    #[serde(default)]
    pub mode: VaultMode,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct VaultEntry {
    pub vault: Vault,
    pub last_opened_at: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
pub struct VaultStore {
    pub vaults: Vec<VaultEntry>,
    pub last_vault_id: Option<String>,
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub fn vault_id_for_path(path: &str) -> String {
    blake3::hash(path.as_bytes()).to_hex().to_string()
}

pub fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .home_dir()
        .map_err(|e| e.to_string())?
        .join(".carbide");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("vaults.json"))
}

pub fn load_store(app: &AppHandle) -> Result<VaultStore, String> {
    log::debug!("Loading vault store");
    let path = store_path(app)?;
    let bytes = match std::fs::read(&path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(VaultStore::default()),
        Err(e) => {
            log::error!("Failed to read vault store at {}: {}", path.display(), e);
            return Err(e.to_string());
        }
    };
    serde_json::from_slice(&bytes).map_err(|e| {
        log::error!("Failed to parse vault store at {}: {}", path.display(), e);
        e.to_string()
    })
}

pub fn save_store(app: &AppHandle, store: &VaultStore) -> Result<(), String> {
    log::debug!("Saving vault store");
    let path = store_path(app)?;
    let bytes = serde_json::to_vec_pretty(store).map_err(|e| e.to_string())?;
    io_utils::atomic_write(&path, bytes)
}

pub fn vault_path_by_id(store: &VaultStore, vault_id: &str) -> Option<String> {
    store
        .vaults
        .iter()
        .find(|v| v.vault.id == vault_id)
        .map(|v| v.vault.path.clone())
}

pub fn normalize_relative_path(path: &Path) -> String {
    path.iter()
        .map(|c| c.to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

pub fn vault_path(app: &AppHandle, vault_id: &str) -> Result<PathBuf, String> {
    let store = load_store(app)?;
    let path = vault_path_by_id(&store, vault_id).ok_or("vault not found")?;
    Ok(PathBuf::from(path))
}

pub fn vault_mode_for_id(app: &AppHandle, vault_id: &str) -> Result<VaultMode, String> {
    let store = load_store(app)?;
    store
        .vaults
        .iter()
        .find(|v| v.vault.id == vault_id)
        .map(|v| v.vault.mode.clone())
        .ok_or_else(|| "vault not found".to_string())
}

fn url_decode(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let hi = chars.next().and_then(|c| (c as char).to_digit(16));
            let lo = chars.next().and_then(|c| (c as char).to_digit(16));
            if let (Some(h), Some(l)) = (hi, lo) {
                result.push((h * 16 + l) as u8 as char);
            } else {
                result.push('%');
            }
        } else {
            result.push(b as char);
        }
    }
    result
}

const EMBEDDED_SDK: &str =
    include_str!("../features/plugin/sdk/carbide_plugin_api.js");

pub fn handle_plugin_request(req: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let uri = req.uri().to_string();

    let without_scheme = uri
        .trim_start_matches("carbide-plugin://")
        .trim_start_matches("carbide-plugin:");

    let query_start = without_scheme.find('?');
    let (path_part, query_part) = if let Some(pos) = query_start {
        (&without_scheme[..pos], &without_scheme[pos + 1..])
    } else {
        (without_scheme, "")
    };

    let mut path_segments = path_part.splitn(2, '/');
    let plugin_id = match path_segments.next() {
        Some(id) if !id.is_empty() => id,
        _ => return Response::builder().status(400).body(Vec::new()).unwrap(),
    };
    let file_rel = path_segments.next().unwrap_or("index.html");
    let file_rel = if file_rel.is_empty() {
        "index.html"
    } else {
        file_rel
    };

    let vault_path = query_part.split('&').find_map(|pair| {
        let mut kv = pair.splitn(2, '=');
        let key = kv.next()?;
        if key == "vault" {
            kv.next().map(url_decode)
        } else {
            None
        }
    });

    let vault_path = match vault_path {
        Some(p) if !p.is_empty() => p,
        _ => return Response::builder().status(400).body(Vec::new()).unwrap(),
    };

    let vault_root = std::path::Path::new(&vault_path);
    let plugin_dir = vault_root.join(".carbide").join("plugins").join(plugin_id);

    let canonical_plugin_dir = match plugin_dir.canonicalize() {
        Ok(p) => p,
        Err(_) => return Response::builder().status(404).body(Vec::new()).unwrap(),
    };

    let target = canonical_plugin_dir.join(file_rel);
    let canonical_target = match target.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            if file_rel == "carbide-plugin-api.js" {
                let sdk = EMBEDDED_SDK.as_bytes().to_vec();
                return Response::builder()
                    .header("Content-Type", "application/javascript")
                    .header("Content-Length", sdk.len().to_string())
                    .header("Access-Control-Allow-Origin", "*")
                    .body(sdk)
                    .unwrap();
            }
            return Response::builder().status(404).body(Vec::new()).unwrap();
        }
    };

    if !canonical_target.starts_with(&canonical_plugin_dir) {
        return Response::builder().status(403).body(Vec::new()).unwrap();
    }

    let bytes = match std::fs::read(&canonical_target) {
        Ok(b) => b,
        Err(_) => return Response::builder().status(404).body(Vec::new()).unwrap(),
    };

    let mime = mime_guess::from_path(&canonical_target).first_or_octet_stream();
    Response::builder()
        .header("Content-Type", mime.as_ref())
        .header("Content-Length", bytes.len().to_string())
        .header("Access-Control-Allow-Origin", "*")
        .body(bytes)
        .unwrap()
}

pub fn handle_excalidraw_request(
    app: &tauri::AppHandle,
    req: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let uri = req.uri().to_string();

    let without_scheme = uri
        .trim_start_matches("carbide-excalidraw://")
        .trim_start_matches("carbide-excalidraw:");

    let query_start = without_scheme.find('?');
    let path_part = if let Some(pos) = query_start {
        &without_scheme[..pos]
    } else {
        without_scheme
    };

    let file_rel = path_part
        .trim_start_matches("localhost/")
        .trim_start_matches('/');
    let file_rel = if file_rel.is_empty() {
        "index.html"
    } else {
        file_rel
    };

    let resource_dir = app
        .path()
        .resource_dir()
        .unwrap_or_default()
        .join("excalidraw-dist");

    let excalidraw_dir = if resource_dir.exists() {
        resource_dir
    } else {
        // Dev mode fallback: excalidraw-dist is built into src-tauri/excalidraw-dist/
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        manifest_dir.join("excalidraw-dist")
    };

    let target = excalidraw_dir.join(file_rel);

    let canonical_base = match excalidraw_dir.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            log::warn!("Excalidraw dist not found at {:?}", excalidraw_dir);
            return Response::builder().status(404).body(Vec::new()).unwrap();
        }
    };
    let canonical_target = match target.canonicalize() {
        Ok(p) => p,
        Err(_) => return Response::builder().status(404).body(Vec::new()).unwrap(),
    };

    if !canonical_target.starts_with(&canonical_base) {
        return Response::builder().status(403).body(Vec::new()).unwrap();
    }

    let bytes = match std::fs::read(&canonical_target) {
        Ok(b) => b,
        Err(_) => return Response::builder().status(404).body(Vec::new()).unwrap(),
    };

    let mime = mime_guess::from_path(&canonical_target).first_or_octet_stream();
    Response::builder()
        .header("Content-Type", mime.as_ref())
        .header("Content-Length", bytes.len().to_string())
        .header("Access-Control-Allow-Origin", "*")
        .body(bytes)
        .unwrap()
}

pub fn handle_asset_request(app: &AppHandle, req: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let uri = req.uri().to_string();
    let rel = uri
        .trim_start_matches("carbide-asset://")
        .trim_start_matches("carbide-asset:")
        .trim_start_matches('/');

    let parts: Vec<&str> = rel.splitn(3, '/').collect();
    if parts.len() < 2 {
        return Response::builder().status(400).body(Vec::new()).unwrap();
    }

    let abs = match parts[0] {
        "vault" => {
            if parts.len() != 3 {
                return Response::builder().status(400).body(Vec::new()).unwrap();
            }
            let vault_id = parts[1];
            let asset_rel = url_decode(parts[2]);
            let vault_path = match vault_path(app, vault_id) {
                Ok(p) => p,
                Err(_) => return Response::builder().status(404).body(Vec::new()).unwrap(),
            };
            match crate::features::notes::service::safe_vault_abs(&vault_path, &asset_rel) {
                Ok(p) => p,
                Err(_) => return Response::builder().status(403).body(Vec::new()).unwrap(),
            }
        }
        "file" => {
            let encoded_path = if parts.len() == 3 {
                format!("{}/{}", parts[1], parts[2])
            } else {
                parts[1].to_string()
            };
            let decoded = url_decode(&encoded_path);
            let abs_decoded = if decoded.starts_with('/') {
                decoded
            } else {
                format!("/{decoded}")
            };
            let path = PathBuf::from(&abs_decoded);
            match path.canonicalize() {
                Ok(p) if p.is_file() => p,
                _ => return Response::builder().status(404).body(Vec::new()).unwrap(),
            }
        }
        _ => return Response::builder().status(400).body(Vec::new()).unwrap(),
    };

    let bytes = match std::fs::read(&abs) {
        Ok(b) => b,
        Err(_) => return Response::builder().status(404).body(Vec::new()).unwrap(),
    };

    let mime = mime_guess::from_path(&abs).first_or_octet_stream();
    Response::builder()
        .header("Content-Type", mime.as_ref())
        .header("Content-Length", bytes.len().to_string())
        .header("Access-Control-Allow-Origin", "*")
        .body(bytes)
        .unwrap()
}
