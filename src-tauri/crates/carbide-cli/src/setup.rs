use std::path::PathBuf;

use crate::auth;

const CARBIDE_CLI_PATH: &str = "/usr/local/bin/carbide";

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

fn build_mcp_server_entry_stdio() -> serde_json::Value {
    serde_json::json!({
        "command": CARBIDE_CLI_PATH,
        "args": ["mcp"]
    })
}

pub fn cli_installed() -> bool {
    let path = std::path::Path::new(CARBIDE_CLI_PATH);
    path.symlink_metadata().is_ok()
}

pub fn setup_desktop() -> Result<(), String> {
    let token = auth::read_token().map_err(|_| {
        "MCP token not found. Start Carbide at least once to generate it.".to_string()
    })?;

    let path = claude_desktop_config_path();

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create Claude config directory: {e}"))?;
    }

    let mut config: serde_json::Value = if path.exists() {
        let content =
            std::fs::read_to_string(&path).map_err(|e| format!("failed to read config: {e}"))?;
        serde_json::from_str(&content).map_err(|e| format!("failed to parse config: {e}"))?
    } else {
        serde_json::json!({})
    };

    let servers = config
        .as_object_mut()
        .ok_or("config is not a JSON object")?
        .entry("mcpServers")
        .or_insert_with(|| serde_json::json!({}));

    servers
        .as_object_mut()
        .ok_or("mcpServers is not a JSON object")?
        .insert("carbide".to_string(), build_mcp_server_entry_stdio());

    let output =
        serde_json::to_string_pretty(&config).map_err(|e| format!("failed to serialize: {e}"))?;

    std::fs::write(&path, output).map_err(|e| format!("failed to write config: {e}"))?;

    // Also verify the token is valid by reading it (already done above)
    let _ = token;

    eprintln!("configured Claude Desktop: {}", path.display());
    eprintln!("  uses stdio transport (carbide mcp)");
    eprintln!("  restart Claude Desktop to pick up changes");
    Ok(())
}

pub fn setup_code(vault_path: &str) -> Result<(), String> {
    let token = auth::read_token().map_err(|_| {
        "MCP token not found. Start Carbide at least once to generate it.".to_string()
    })?;

    let vault_dir = PathBuf::from(vault_path);
    if !vault_dir.is_dir() {
        return Err(format!("vault path does not exist: {vault_path}"));
    }

    let mcp_json_path = vault_dir.join(".mcp.json");

    let mut config: serde_json::Value = if mcp_json_path.exists() {
        let content = std::fs::read_to_string(&mcp_json_path)
            .map_err(|e| format!("failed to read .mcp.json: {e}"))?;
        serde_json::from_str(&content).map_err(|e| format!("failed to parse .mcp.json: {e}"))?
    } else {
        serde_json::json!({})
    };

    let entry = serde_json::json!({
        "type": "http",
        "url": "http://localhost:3457/mcp",
        "headers": {
            "Authorization": format!("Bearer {}", token)
        }
    });

    let servers = config
        .as_object_mut()
        .ok_or(".mcp.json is not a JSON object")?
        .entry("mcpServers")
        .or_insert_with(|| serde_json::json!({}));

    servers
        .as_object_mut()
        .ok_or("mcpServers is not a JSON object")?
        .insert("carbide".to_string(), entry);

    let output =
        serde_json::to_string_pretty(&config).map_err(|e| format!("failed to serialize: {e}"))?;

    std::fs::write(&mcp_json_path, output)
        .map_err(|e| format!("failed to write .mcp.json: {e}"))?;

    eprintln!("configured Claude Code: {}", mcp_json_path.display());
    eprintln!("  uses HTTP transport (direct)");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_mcp_server_entry_stdio_format() {
        let entry = build_mcp_server_entry_stdio();
        assert_eq!(entry["command"], CARBIDE_CLI_PATH);
        assert_eq!(entry["args"][0], "mcp");
        assert!(entry.get("type").is_none());
    }

    #[test]
    fn cli_installed_returns_bool() {
        let _ = cli_installed();
    }
}
