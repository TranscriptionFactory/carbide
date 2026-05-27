use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

use super::http_fetch::plugin_http_fetch;
use crate::features::plugin::http_fetch::PluginHttpRequest;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceFile {
    pub filename: String,
    pub download_url: String,
}

fn validate_github_raw_url(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|e| format!("Invalid URL: {e}"))?;
    match parsed.host_str() {
        Some("raw.githubusercontent.com") | Some("api.github.com") => Ok(()),
        _ => Err(format!(
            "URL must be raw.githubusercontent.com or api.github.com, got: {}",
            parsed.host_str().unwrap_or("none")
        )),
    }
}

pub fn validate_path_segment(segment: &str) -> Result<(), String> {
    if segment.is_empty() {
        return Err("Plugin ID cannot be empty".to_string());
    }
    if segment.contains('/') || segment.contains('\\') || segment.contains("..") {
        return Err(format!("Invalid plugin ID: {segment}"));
    }
    Ok(())
}

fn validate_plugin_filename(filename: &str) -> Result<(), String> {
    if filename.is_empty() {
        return Err("Filename cannot be empty".to_string());
    }
    if filename.contains('\\') || filename.contains("..") {
        return Err(format!("Invalid plugin filename: {filename}"));
    }
    if filename.starts_with('/') {
        return Err(format!("Invalid plugin filename: {filename}"));
    }
    Ok(())
}

#[tauri::command]
pub async fn marketplace_fetch_index(url: String) -> Result<String, String> {
    validate_github_raw_url(&url)?;

    let request = PluginHttpRequest {
        url,
        method: "GET".to_string(),
        headers: None,
        body: None,
    };

    let response = plugin_http_fetch(request).await?;
    if !response.ok {
        return Err(format!("HTTP {}: failed to fetch index", response.status));
    }
    Ok(response.body)
}

#[tauri::command]
pub async fn marketplace_install_plugin(
    app: AppHandle,
    plugin_id: String,
    files: Vec<MarketplaceFile>,
) -> Result<(), String> {
    validate_path_segment(&plugin_id)?;

    let home_dir = app.path().home_dir().map_err(|e| e.to_string())?;
    let plugin_dir: PathBuf = home_dir.join(".carbide").join("plugins").join(&plugin_id);

    std::fs::create_dir_all(&plugin_dir)
        .map_err(|e| format!("Failed to create plugin dir: {e}"))?;

    for file in &files {
        validate_github_raw_url(&file.download_url)?;
        validate_plugin_filename(&file.filename)?;

        let request = PluginHttpRequest {
            url: file.download_url.clone(),
            method: "GET".to_string(),
            headers: None,
            body: None,
        };

        let response = plugin_http_fetch(request).await?;
        if !response.ok {
            return Err(format!(
                "Failed to download {}: HTTP {}",
                file.filename, response.status
            ));
        }

        let file_path = plugin_dir.join(&file.filename);
        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory for {}: {e}", file.filename))?;
        }
        std::fs::write(&file_path, response.body.as_bytes())
            .map_err(|e| format!("Failed to write {}: {e}", file.filename))?;
    }

    Ok(())
}
