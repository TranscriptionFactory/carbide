use keyring::Entry;

const KEYRING_SERVICE: &str = "carbide";

fn entry(provider_id: &str) -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, provider_id).map_err(|e| format!("Keychain unavailable: {e}"))
}

pub fn keychain_lookup(provider_id: &str) -> Option<String> {
    entry(provider_id).ok()?.get_password().ok()
}

pub fn resolve_api_key_with(
    keychain: impl Fn(&str) -> Option<String>,
    env: impl Fn(&str) -> Option<String>,
    provider_id: &str,
    api_key_env: Option<&str>,
) -> Option<String> {
    keychain(provider_id)
        .filter(|v| !v.is_empty())
        .or_else(|| env(api_key_env?))
        .filter(|v| !v.is_empty())
}

pub fn resolve_api_key(provider_id: &str, api_key_env: Option<&str>) -> Option<String> {
    resolve_api_key_with(
        keychain_lookup,
        |name| std::env::var(name).ok(),
        provider_id,
        api_key_env,
    )
}

fn last4(key: &str) -> String {
    let chars: Vec<char> = key.chars().collect();
    let start = chars.len().saturating_sub(4);
    chars[start..].iter().collect()
}

#[tauri::command]
#[specta::specta]
pub async fn ai_set_api_key(provider_id: String, key: String) -> Result<(), String> {
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("API key is empty".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        entry(&provider_id)?
            .set_password(&key)
            .map_err(|e| format!("Failed to store API key: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub async fn ai_delete_api_key(provider_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || match entry(&provider_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to delete API key: {e}")),
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub async fn ai_has_api_key(provider_id: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || match entry(&provider_id)?.get_password() {
        Ok(key) if !key.is_empty() => Ok(Some(last4(&key))),
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to read API key: {e}")),
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{last4, resolve_api_key_with};

    fn no_keychain(_: &str) -> Option<String> {
        None
    }

    fn no_env(_: &str) -> Option<String> {
        None
    }

    #[test]
    fn keychain_hit_beats_env() {
        let result = resolve_api_key_with(
            |id| (id == "p1").then(|| "kc-key".to_string()),
            |_| Some("env-key".to_string()),
            "p1",
            Some("MY_KEY"),
        );
        assert_eq!(result, Some("kc-key".to_string()));
    }

    #[test]
    fn empty_keychain_falls_back_to_env() {
        let result = resolve_api_key_with(
            no_keychain,
            |name| (name == "MY_KEY").then(|| "env-key".to_string()),
            "p1",
            Some("MY_KEY"),
        );
        assert_eq!(result, Some("env-key".to_string()));
    }

    #[test]
    fn empty_string_keychain_value_falls_back_to_env() {
        let result = resolve_api_key_with(
            |_| Some(String::new()),
            |_| Some("env-key".to_string()),
            "p1",
            Some("MY_KEY"),
        );
        assert_eq!(result, Some("env-key".to_string()));
    }

    #[test]
    fn no_key_anywhere_is_none() {
        assert_eq!(
            resolve_api_key_with(no_keychain, no_env, "p1", Some("MY_KEY")),
            None
        );
    }

    #[test]
    fn missing_env_name_skips_env_lookup() {
        let result =
            resolve_api_key_with(no_keychain, |_| Some("env-key".to_string()), "p1", None);
        assert_eq!(result, None);
    }

    #[test]
    fn empty_env_value_is_none() {
        let result = resolve_api_key_with(
            no_keychain,
            |_| Some(String::new()),
            "p1",
            Some("MY_KEY"),
        );
        assert_eq!(result, None);
    }

    #[test]
    fn last4_clamps_short_keys() {
        assert_eq!(last4("abcdef"), "cdef");
        assert_eq!(last4("ab"), "ab");
        assert_eq!(last4(""), "");
    }
}
