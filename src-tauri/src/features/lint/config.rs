use std::path::{Path, PathBuf};

use crate::shared::constants::APP_DIR;

const DEFAULT_CONFIG: &str = r#"# Carbide default rumdl configuration
# Rules tuned for GFM/Obsidian conventions

# Disable rules that conflict with wiki-links and Obsidian patterns
[MD033]
enabled = false

[MD041]
enabled = false

# Allow longer lines (common in notes)
[MD013]
line_length = 120
"#;

pub fn config_path(vault_path: &Path) -> PathBuf {
    vault_path.join(APP_DIR).join(".rumdl.toml")
}

pub fn write_default_config(vault_path: &Path) -> Result<(), anyhow::Error> {
    let path = config_path(vault_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if !path.exists() {
        std::fs::write(&path, DEFAULT_CONFIG)?;
    }
    Ok(())
}

pub fn write_merged_config(vault_path: &Path, user_overrides: &str) -> Result<(), anyhow::Error> {
    let path = config_path(vault_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let content = if user_overrides.is_empty() {
        DEFAULT_CONFIG.to_string()
    } else {
        format!("{DEFAULT_CONFIG}\n# User overrides\n{user_overrides}\n")
    };
    std::fs::write(&path, content)?;
    Ok(())
}
