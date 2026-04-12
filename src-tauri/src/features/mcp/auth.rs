use std::path::PathBuf;
use subtle::ConstantTimeEq;

const TOKEN_BYTES: usize = 32;

pub fn token_path() -> PathBuf {
    dirs_config_path().join("mcp-token")
}

fn dirs_config_path() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".carbide")
}

pub fn read_or_create_token() -> Result<String, String> {
    let path = token_path();

    if path.exists() {
        let token = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read MCP token: {}", e))?;
        let token = token.trim().to_string();
        if !token.is_empty() {
            return Ok(token);
        }
    }

    generate_and_save_token()
}

pub fn generate_and_save_token() -> Result<String, String> {
    let path = token_path();

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
    }

    let mut bytes = [0u8; TOKEN_BYTES];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut bytes);
    let token = hex::encode(bytes);

    std::fs::write(&path, &token).map_err(|e| format!("Failed to write MCP token: {}", e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(&path, perms)
            .map_err(|e| format!("Failed to set token permissions: {}", e))?;
    }

    Ok(token)
}

pub fn verify_token(provided: &str, expected: &str) -> bool {
    let provided_bytes = provided.as_bytes();
    let expected_bytes = expected.as_bytes();

    if provided_bytes.len() != expected_bytes.len() {
        return false;
    }

    provided_bytes.ct_eq(expected_bytes).into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verify_token_valid() {
        assert!(verify_token("abc123", "abc123"));
    }

    #[test]
    fn test_verify_token_invalid() {
        assert!(!verify_token("abc123", "xyz789"));
    }

    #[test]
    fn test_verify_token_different_lengths() {
        assert!(!verify_token("short", "longer_token"));
    }

    #[test]
    fn test_verify_token_empty() {
        assert!(verify_token("", ""));
    }

    #[test]
    fn test_read_or_create_token_creates_file() {
        let dir = tempfile::tempdir().unwrap();
        std::env::set_var("HOME", dir.path());
        let result = read_or_create_token();
        assert!(result.is_ok());
        let token = result.unwrap();
        assert_eq!(token.len(), TOKEN_BYTES * 2);

        let reread = read_or_create_token().unwrap();
        assert_eq!(token, reread);
        std::env::remove_var("HOME");
    }
}
