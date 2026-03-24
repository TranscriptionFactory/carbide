use crate::shared::io_utils;
use crate::shared::storage;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;

const CROSSREF_CSL_BASE: &str = "https://api.crossref.org/works";

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

fn http_client() -> &'static reqwest::Client {
    use std::sync::OnceLock;
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(reqwest::Client::new)
}

fn encode_doi_path(doi: &str) -> String {
    url::form_urlencoded::byte_serialize(doi.trim().as_bytes()).collect()
}

#[tauri::command]
#[specta::specta]
pub async fn reference_doi_lookup(
    doi: String,
) -> Result<Option<serde_json::Value>, String> {
    let encoded = encode_doi_path(&doi);
    let url = format!(
        "{}/{}/transform/application/vnd.citationstyles.csl+json",
        CROSSREF_CSL_BASE, encoded
    );

    let response = http_client()
        .get(&url)
        .header("Accept", "application/vnd.citationstyles.csl+json")
        .header(
            "User-Agent",
            "Carbide/1.0 (mailto:support@carbide.app)",
        )
        .send()
        .await
        .map_err(|e| format!("DOI lookup failed: {e}"))?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }

    if !response.status().is_success() {
        return Err(format!(
            "CrossRef returned status {}",
            response.status()
        ));
    }

    let csl: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse CrossRef response: {e}"))?;

    Ok(Some(csl))
}

async fn bbt_rpc(
    url: &str,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
        "id": 1
    });

    let response = http_client()
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("BBT RPC request failed: {e}"))?;

    let payload: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse BBT response: {e}"))?;

    if let Some(error) = payload.get("error") {
        return Err(format!("BBT RPC error: {error}"));
    }

    payload
        .get("result")
        .cloned()
        .ok_or_else(|| "BBT response missing 'result' field".to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn reference_bbt_test_connection(
    bbt_url: String,
) -> Result<bool, String> {
    match bbt_rpc(&bbt_url, "db.test", serde_json::json!([])).await {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn reference_bbt_search(
    bbt_url: String,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<serde_json::Value>, String> {
    let result = bbt_rpc(&bbt_url, "item.search", serde_json::json!([query])).await?;

    let mut items: Vec<serde_json::Value> = result
        .as_array()
        .cloned()
        .unwrap_or_default();

    if let Some(n) = limit {
        items.truncate(n as usize);
    }

    Ok(items)
}

#[tauri::command]
#[specta::specta]
pub async fn reference_bbt_get_item(
    bbt_url: String,
    citekey: String,
) -> Result<Option<serde_json::Value>, String> {
    let result = bbt_rpc(
        &bbt_url,
        "item.export",
        serde_json::json!([citekey, "csljson"]),
    )
    .await?;

    let csl_str = result
        .as_str()
        .ok_or_else(|| "BBT item.export result is not a string".to_string())?;

    let parsed: serde_json::Value = serde_json::from_str(csl_str)
        .map_err(|e| format!("Failed to parse CSL JSON from BBT: {e}"))?;

    let first = parsed
        .as_array()
        .and_then(|arr| arr.first())
        .cloned();

    Ok(first)
}

#[tauri::command]
#[specta::specta]
pub async fn reference_bbt_collections(
    bbt_url: String,
) -> Result<Vec<serde_json::Value>, String> {
    let result = bbt_rpc(&bbt_url, "collection.list", serde_json::json!([])).await?;

    Ok(result.as_array().cloned().unwrap_or_default())
}

#[tauri::command]
#[specta::specta]
pub async fn reference_bbt_collection_items(
    bbt_url: String,
    collection_key: String,
) -> Result<Vec<serde_json::Value>, String> {
    let result = bbt_rpc(
        &bbt_url,
        "collection.items",
        serde_json::json!([collection_key]),
    )
    .await?;

    Ok(result.as_array().cloned().unwrap_or_default())
}

#[tauri::command]
#[specta::specta]
pub async fn reference_bbt_bibliography(
    bbt_url: String,
    citekeys: Vec<String>,
    style: Option<String>,
) -> Result<String, String> {
    let style_id = style.unwrap_or_else(|| "apa".to_string());
    let result = bbt_rpc(
        &bbt_url,
        "item.bibliography",
        serde_json::json!([citekeys, { "id": style_id }]),
    )
    .await?;

    result
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "BBT bibliography result is not a string".to_string())
}
