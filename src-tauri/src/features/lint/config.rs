use std::path::Path;

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

pub fn write_default_config(vault_path: &Path) -> Result<(), anyhow::Error> {
    let config_path = vault_path.join(".rumdl.toml");
    if !config_path.exists() {
        std::fs::write(&config_path, DEFAULT_CONFIG)?;
    }
    Ok(())
}

pub fn write_merged_config(vault_path: &Path, user_overrides: &str) -> Result<(), anyhow::Error> {
    let config_path = vault_path.join(".rumdl.toml");
    let content = if user_overrides.is_empty() {
        DEFAULT_CONFIG.to_string()
    } else {
        format!("{DEFAULT_CONFIG}\n# User overrides\n{user_overrides}\n")
    };
    std::fs::write(&config_path, content)?;
    Ok(())
}
