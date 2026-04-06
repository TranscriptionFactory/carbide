use std::path::PathBuf;

fn token_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".carbide").join("mcp-token"))
}

pub fn read_token() -> Result<String, String> {
    let path = token_path().ok_or("cannot determine home directory")?;
    std::fs::read_to_string(&path)
        .map(|t| t.trim().to_string())
        .map_err(|e| format!("failed to read token from {}: {}", path.display(), e))
}
