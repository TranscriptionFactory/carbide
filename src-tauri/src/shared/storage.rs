use crate::shared::asset_cache::{serve_with_cache, AssetCacheState, CachePolicy};
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
    log::trace!("Loading vault store");
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

fn build_response(status: u16, mime: &str, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Content-Type", mime)
        .header("Content-Length", body.len().to_string())
        .header("Cache-Control", "no-store")
        .header("Access-Control-Allow-Origin", "*")
        .body(body)
        .unwrap_or_else(|error| {
            log::error!("Failed to build scheme response: {}", error);
            Response::new(Vec::new())
        })
}

fn error_response(
    scheme: &str,
    uri: &str,
    status: u16,
    reason: impl AsRef<str>,
) -> Response<Vec<u8>> {
    let reason = reason.as_ref();
    log::error!(
        "Custom scheme request failed: scheme={} status={} uri={} reason={}",
        scheme,
        status,
        uri,
        reason
    );
    build_response(
        status,
        "text/plain; charset=utf-8",
        reason.as_bytes().to_vec(),
    )
}

pub fn internal_error_response(scheme: &str, reason: impl AsRef<str>) -> Response<Vec<u8>> {
    let reason = reason.as_ref();
    log::error!(
        "Custom scheme handler panicked: scheme={} reason={}",
        scheme,
        reason
    );
    build_response(500, "text/plain; charset=utf-8", reason.as_bytes().to_vec())
}

fn try_url_decode(input: &str) -> Result<String, String> {
    let mut bytes = Vec::with_capacity(input.len());
    let mut iter = input.bytes();
    while let Some(b) = iter.next() {
        if b == b'%' {
            let hi = iter.next().and_then(|c| (c as char).to_digit(16));
            let lo = iter.next().and_then(|c| (c as char).to_digit(16));
            if let (Some(h), Some(l)) = (hi, lo) {
                bytes.push((h * 16 + l) as u8);
            } else {
                return Err(format!("invalid percent encoding in {}", input));
            }
        } else {
            bytes.push(b);
        }
    }
    String::from_utf8(bytes).map_err(|error| format!("invalid utf-8 in url component: {}", error))
}

#[cfg(test)]
fn url_decode(input: &str) -> String {
    try_url_decode(input).unwrap_or_else(|error| format!("__decode_error__:{error}"))
}

const EMBEDDED_SDK: &str = include_str!("../features/plugin/sdk/carbide_plugin_api.js");


fn resolve_active_vault_path(app: &AppHandle) -> Option<String> {
    let store = load_store(app).ok()?;
    let vault_id = store.last_vault_id.as_ref()?;
    vault_path_by_id(&store, vault_id)
}

pub fn handle_plugin_request(app: &AppHandle, req: Request<Vec<u8>>) -> Response<Vec<u8>> {
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
        _ => return error_response("carbide-plugin", &uri, 400, "missing plugin id"),
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
            kv.next().map(try_url_decode)
        } else {
            None
        }
    });

    let vault_path = match vault_path {
        Some(Ok(p)) if !p.is_empty() => p,
        Some(Ok(_)) => {
            return error_response("carbide-plugin", &uri, 400, "missing vault path");
        }
        Some(Err(error)) => return error_response("carbide-plugin", &uri, 400, error),
        None => match resolve_active_vault_path(app) {
            Some(p) => p,
            None => {
                return error_response(
                    "carbide-plugin",
                    &uri,
                    400,
                    "missing vault query and no active vault",
                )
            }
        },
    };

    let vault_root = std::path::Path::new(&vault_path);
    let plugin_dir = vault_root.join(".carbide").join("plugins").join(plugin_id);

    let canonical_plugin_dir = match plugin_dir.canonicalize() {
        Ok(p) => p,
        Err(error) => {
            return error_response(
                "carbide-plugin",
                &uri,
                404,
                format!("plugin directory unavailable: {}", error),
            );
        }
    };

    let target = canonical_plugin_dir.join(file_rel);
    let canonical_target = match target.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            if file_rel == "carbide-plugin-api.js" {
                let cache_state = app.state::<AssetCacheState>();
                let key = format!("__sdk__/carbide-plugin-api.js");
                return serve_with_cache(
                    &cache_state.plugin,
                    key,
                    CachePolicy::Immutable,
                    &req,
                    || {
                        Some((
                            EMBEDDED_SDK.as_bytes().to_vec(),
                            "application/javascript".into(),
                        ))
                    },
                );
            }
            return error_response(
                "carbide-plugin",
                &uri,
                404,
                format!("plugin asset not found: {}", target.display()),
            );
        }
    };

    if !canonical_target.starts_with(&canonical_plugin_dir) {
        return error_response(
            "carbide-plugin",
            &uri,
            403,
            format!("plugin asset escaped root: {}", canonical_target.display()),
        );
    }

    let cache_state = app.state::<AssetCacheState>();
    let cache_key = format!("{}/{}", plugin_id, file_rel);
    let policy = CachePolicy::ModerateLifetime;
    let target_path = canonical_target.clone();

    serve_with_cache(&cache_state.plugin, cache_key, policy, &req, || {
        let bytes = match std::fs::read(&target_path) {
            Ok(bytes) => bytes,
            Err(error) => {
                log::error!(
                    "Plugin asset read failed: uri={} path={} error={}",
                    uri,
                    target_path.display(),
                    error
                );
                return None;
            }
        };
        let mime = mime_guess::from_path(&target_path)
            .first_or_octet_stream()
            .to_string();
        Some((bytes, mime))
    })
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
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        manifest_dir.join("excalidraw-dist")
    };

    let target = excalidraw_dir.join(file_rel);

    let canonical_base = match excalidraw_dir.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            log::warn!("Excalidraw dist not found at {:?}", excalidraw_dir);
            return error_response("carbide-excalidraw", &uri, 404, "excalidraw dist not found");
        }
    };
    let canonical_target = match target.canonicalize() {
        Ok(p) => p,
        Err(error) => {
            return error_response(
                "carbide-excalidraw",
                &uri,
                404,
                format!("excalidraw asset not found: {}", error),
            );
        }
    };

    if !canonical_target.starts_with(&canonical_base) {
        return error_response(
            "carbide-excalidraw",
            &uri,
            403,
            format!(
                "excalidraw asset escaped root: {}",
                canonical_target.display()
            ),
        );
    }

    let cache_state = app.state::<AssetCacheState>();
    let cache_key = file_rel.to_string();
    let target_path = canonical_target.clone();

    serve_with_cache(
        &cache_state.excalidraw,
        cache_key,
        CachePolicy::Immutable,
        &req,
        || {
            let bytes = match std::fs::read(&target_path) {
                Ok(bytes) => bytes,
                Err(error) => {
                    log::error!(
                        "Excalidraw asset read failed: uri={} path={} error={}",
                        uri,
                        target_path.display(),
                        error
                    );
                    return None;
                }
            };
            let mime = mime_guess::from_path(&target_path)
                .first_or_octet_stream()
                .to_string();
            Some((bytes, mime))
        },
    )
}

pub fn handle_asset_request(app: &AppHandle, req: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let uri = req.uri().to_string();
    let rel = uri
        .trim_start_matches("carbide-asset://")
        .trim_start_matches("carbide-asset:")
        .trim_start_matches('/');

    let parts: Vec<&str> = rel.splitn(3, '/').collect();
    if parts.len() < 2 {
        return error_response("carbide-asset", &uri, 400, "invalid asset url");
    }

    match parts[0] {
        "vault" => {
            if parts.len() != 3 {
                return error_response("carbide-asset", &uri, 400, "missing vault asset path");
            }
            let vault_id = parts[1];
            let asset_rel = match try_url_decode(parts[2]) {
                Ok(path) => path,
                Err(error) => return error_response("carbide-asset", &uri, 400, error),
            };
            let vp = match vault_path(app, vault_id) {
                Ok(p) => p,
                Err(error) => {
                    return error_response("carbide-asset", &uri, 404, error);
                }
            };
            let abs = match crate::features::notes::service::safe_vault_abs(&vp, &asset_rel) {
                Ok(p) => p,
                Err(error) => {
                    return error_response("carbide-asset", &uri, 403, error);
                }
            };

            let cache_state = app.state::<AssetCacheState>();
            let cache_key = format!("{}/{}", vault_id, asset_rel);

            serve_with_cache(
                &cache_state.vault,
                cache_key,
                CachePolicy::ShortWithValidation,
                &req,
                || {
                    let bytes = match std::fs::read(&abs) {
                        Ok(bytes) => bytes,
                        Err(error) => {
                            log::error!(
                                "Vault asset read failed: uri={} path={} error={}",
                                uri,
                                abs.display(),
                                error
                            );
                            return None;
                        }
                    };
                    let mime = mime_guess::from_path(&abs)
                        .first_or_octet_stream()
                        .to_string();
                    Some((bytes, mime))
                },
            )
        }
        "file" => {
            let encoded_path = if parts.len() == 3 {
                format!("{}/{}", parts[1], parts[2])
            } else {
                parts[1].to_string()
            };
            let decoded = match try_url_decode(&encoded_path) {
                Ok(path) => path,
                Err(error) => return error_response("carbide-asset", &uri, 400, error),
            };
            let abs_decoded = if decoded.starts_with('/') {
                decoded
            } else {
                format!("/{decoded}")
            };
            let path = PathBuf::from(&abs_decoded);
            let abs = match path.canonicalize() {
                Ok(p) if p.is_file() => p,
                _ => return error_response("carbide-asset", &uri, 404, "file asset not found"),
            };

            let cache_state = app.state::<AssetCacheState>();
            let cache_key = format!("file/{}", abs.display());
            let target_path = abs.clone();

            serve_with_cache(
                &cache_state.vault,
                cache_key,
                CachePolicy::ShortWithValidation,
                &req,
                || {
                    let bytes = match std::fs::read(&target_path) {
                        Ok(b) => b,
                        Err(_) => return None,
                    };
                    let mime = mime_guess::from_path(&target_path)
                        .first_or_octet_stream()
                        .to_string();
                    Some((bytes, mime))
                },
            )
        }
        _ => error_response("carbide-asset", &uri, 400, "unknown asset namespace"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_decode_ascii_space() {
        assert_eq!(url_decode("hello%20world"), "hello world");
    }

    #[test]
    fn url_decode_multibyte_utf8() {
        assert_eq!(url_decode("%E2%98%83"), "☃");
    }

    #[test]
    fn url_decode_mixed_path() {
        assert_eq!(
            url_decode("path/%E4%B8%AD%E6%96%87/file.md"),
            "path/中文/file.md"
        );
    }

    #[test]
    fn url_decode_no_encoding() {
        assert_eq!(url_decode("plain"), "plain");
    }

    #[test]
    fn url_decode_incomplete_sequence() {
        assert_eq!(
            try_url_decode("abc%2").unwrap_err(),
            "invalid percent encoding in abc%2"
        );
    }

    #[test]
    fn build_response_sets_headers() {
        let response = build_response(418, "text/plain", b"teapot".to_vec());
        assert_eq!(response.status(), 418);
        assert_eq!(
            response.headers().get("Content-Type").unwrap(),
            "text/plain"
        );
        assert_eq!(response.headers().get("Content-Length").unwrap(), "6");
    }

    #[test]
    fn internal_error_response_is_non_empty() {
        let response = internal_error_response("carbide-asset", "panic");
        assert_eq!(response.status(), 500);
        assert_eq!(response.headers().get("Cache-Control").unwrap(), "no-store");
        assert_eq!(response.body(), b"panic");
    }
}
