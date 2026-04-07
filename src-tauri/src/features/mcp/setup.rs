use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::features::mcp::auth;
use crate::features::mcp::http::DEFAULT_PORT;
use crate::shared::storage;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatus {
    pub claude_desktop_configured: bool,
    pub claude_code_configured: bool,
    pub http_port: u16,
    pub token_exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SetupResult {
    pub success: bool,
    pub path: String,
    pub message: String,
}

fn mcp_server_url() -> String {
    format!("http://localhost:{}/mcp", DEFAULT_PORT)
}

fn home_dir() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn claude_desktop_config_path() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        home_dir().join("Library/Application Support/Claude/claude_desktop_config.json")
    }
    #[cfg(target_os = "linux")]
    {
        home_dir().join(".config/Claude/claude_desktop_config.json")
    }
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
        PathBuf::from(appdata).join("Claude/claude_desktop_config.json")
    }
}

fn build_mcp_server_entry(token: &str) -> serde_json::Value {
    serde_json::json!({
        "url": mcp_server_url(),
        "headers": {
            "Authorization": format!("Bearer {}", token)
        }
    })
}

pub fn write_claude_desktop_config(token: &str) -> Result<SetupResult, String> {
    let path = claude_desktop_config_path();

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create Claude config directory: {}", e))?;
    }

    let mut config: serde_json::Value = if path.exists() {
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read existing config: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse existing config: {}", e))?
    } else {
        serde_json::json!({})
    };

    let servers = config
        .as_object_mut()
        .ok_or("Config is not a JSON object")?
        .entry("mcpServers")
        .or_insert_with(|| serde_json::json!({}));

    servers
        .as_object_mut()
        .ok_or("mcpServers is not a JSON object")?
        .insert("carbide".to_string(), build_mcp_server_entry(token));

    let output = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    std::fs::write(&path, output).map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(SetupResult {
        success: true,
        path: path.to_string_lossy().to_string(),
        message: "Claude Desktop configured with Carbide MCP server".to_string(),
    })
}

pub fn write_claude_code_config(vault_path: &str, token: &str) -> Result<SetupResult, String> {
    let vault_dir = PathBuf::from(vault_path);
    let mcp_json_path = vault_dir.join(".mcp.json");

    let mut config: serde_json::Value = if mcp_json_path.exists() {
        let content = std::fs::read_to_string(&mcp_json_path)
            .map_err(|e| format!("Failed to read existing .mcp.json: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse existing .mcp.json: {}", e))?
    } else {
        serde_json::json!({})
    };

    let entry = {
        let mut e = build_mcp_server_entry(token);
        e.as_object_mut()
            .unwrap()
            .insert("type".to_string(), serde_json::json!("http"));
        e
    };

    let servers = config
        .as_object_mut()
        .ok_or(".mcp.json is not a JSON object")?
        .entry("mcpServers")
        .or_insert_with(|| serde_json::json!({}));

    servers
        .as_object_mut()
        .ok_or("mcpServers is not a JSON object")?
        .insert("carbide".to_string(), entry);

    let output = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize .mcp.json: {}", e))?;

    std::fs::write(&mcp_json_path, output)
        .map_err(|e| format!("Failed to write .mcp.json: {}", e))?;

    Ok(SetupResult {
        success: true,
        path: mcp_json_path.to_string_lossy().to_string(),
        message: "Claude Code configured with Carbide MCP server".to_string(),
    })
}

pub fn check_claude_desktop_configured() -> bool {
    let path = claude_desktop_config_path();
    if !path.exists() {
        return false;
    }
    let Ok(content) = std::fs::read_to_string(&path) else {
        return false;
    };
    let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) else {
        return false;
    };
    config
        .get("mcpServers")
        .and_then(|s| s.get("carbide"))
        .is_some()
}

pub fn check_claude_code_configured(vault_path: &str) -> bool {
    let mcp_json_path = PathBuf::from(vault_path).join(".mcp.json");
    if !mcp_json_path.exists() {
        return false;
    }
    let Ok(content) = std::fs::read_to_string(&mcp_json_path) else {
        return false;
    };
    let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) else {
        return false;
    };
    config
        .get("mcpServers")
        .and_then(|s| s.get("carbide"))
        .is_some()
}

fn token_exists() -> bool {
    home_dir().join(".carbide/mcp-token").exists()
}

pub fn get_setup_status(vault_path: Option<&str>) -> SetupStatus {
    SetupStatus {
        claude_desktop_configured: check_claude_desktop_configured(),
        claude_code_configured: vault_path
            .map(|p| check_claude_code_configured(p))
            .unwrap_or(false),
        http_port: DEFAULT_PORT,
        token_exists: token_exists(),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_setup_claude_desktop() -> Result<SetupResult, String> {
    let token = auth::read_or_create_token()?;
    write_claude_desktop_config(&token)
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_setup_claude_code(
    app: AppHandle,
    vault_id: String,
) -> Result<SetupResult, String> {
    let token = auth::read_or_create_token()?;
    let vault_path = storage::vault_path(&app, &vault_id)?;
    write_claude_code_config(&vault_path.to_string_lossy(), &token)
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_regenerate_token() -> Result<String, String> {
    auth::generate_and_save_token()
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_get_setup_status(app: AppHandle) -> Result<SetupStatus, String> {
    let vault_path = storage::load_store(&app).ok().and_then(|store| {
        store
            .last_vault_id
            .as_ref()
            .and_then(|id| storage::vault_path_by_id(&store, id))
    });
    Ok(get_setup_status(vault_path.as_deref()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mcp_server_url() {
        assert_eq!(
            mcp_server_url(),
            format!("http://localhost:{}/mcp", DEFAULT_PORT)
        );
    }

    #[test]
    fn test_build_mcp_server_entry() {
        let entry = build_mcp_server_entry("test_token");
        assert_eq!(
            entry["url"],
            format!("http://localhost:{}/mcp", DEFAULT_PORT)
        );
        assert_eq!(entry["headers"]["Authorization"], "Bearer test_token");
    }

    #[test]
    fn test_write_claude_desktop_config_creates_new() {
        let dir = tempfile::tempdir().unwrap();
        let config_path = dir.path().join("Claude/claude_desktop_config.json");

        std::env::set_var("HOME", dir.path());

        let result = write_claude_desktop_config("test_token_123");

        #[cfg(target_os = "macos")]
        {
            let expected_path = dir
                .path()
                .join("Library/Application Support/Claude/claude_desktop_config.json");
            if result.is_ok() {
                let content = std::fs::read_to_string(&expected_path).unwrap();
                let config: serde_json::Value = serde_json::from_str(&content).unwrap();
                assert!(config["mcpServers"]["carbide"].is_object());
                assert_eq!(
                    config["mcpServers"]["carbide"]["headers"]["Authorization"],
                    "Bearer test_token_123"
                );
            }
        }

        std::env::remove_var("HOME");
    }

    #[test]
    fn test_write_claude_code_config_creates_new() {
        let dir = tempfile::tempdir().unwrap();
        let vault_path = dir.path().to_string_lossy().to_string();

        let result = write_claude_code_config(&vault_path, "test_token_456").unwrap();
        assert!(result.success);

        let mcp_json = dir.path().join(".mcp.json");
        let content = std::fs::read_to_string(&mcp_json).unwrap();
        let config: serde_json::Value = serde_json::from_str(&content).unwrap();

        assert_eq!(config["mcpServers"]["carbide"]["type"], "http");
        assert_eq!(
            config["mcpServers"]["carbide"]["headers"]["Authorization"],
            "Bearer test_token_456"
        );
    }

    #[test]
    fn test_write_claude_code_config_merges_existing() {
        let dir = tempfile::tempdir().unwrap();
        let vault_path = dir.path().to_string_lossy().to_string();
        let mcp_json = dir.path().join(".mcp.json");

        let existing = serde_json::json!({
            "mcpServers": {
                "other_server": { "command": "other" }
            }
        });
        std::fs::write(&mcp_json, serde_json::to_string_pretty(&existing).unwrap()).unwrap();

        write_claude_code_config(&vault_path, "new_token").unwrap();

        let content = std::fs::read_to_string(&mcp_json).unwrap();
        let config: serde_json::Value = serde_json::from_str(&content).unwrap();

        assert!(config["mcpServers"]["other_server"].is_object());
        assert!(config["mcpServers"]["carbide"].is_object());
    }

    #[test]
    fn test_check_claude_code_configured_false_no_file() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!check_claude_code_configured(&dir.path().to_string_lossy()));
    }

    #[test]
    fn test_check_claude_code_configured_true() {
        let dir = tempfile::tempdir().unwrap();
        let vault_path = dir.path().to_string_lossy().to_string();

        write_claude_code_config(&vault_path, "tok").unwrap();
        assert!(check_claude_code_configured(&vault_path));
    }

    #[test]
    fn test_get_setup_status_no_vault() {
        let status = get_setup_status(None);
        assert!(!status.claude_code_configured);
        assert_eq!(status.http_port, DEFAULT_PORT);
    }

    #[test]
    fn test_setup_result_serialization() {
        let result = SetupResult {
            success: true,
            path: "/tmp/test".to_string(),
            message: "done".to_string(),
        };
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["success"], true);
        assert_eq!(json["path"], "/tmp/test");
    }
}
