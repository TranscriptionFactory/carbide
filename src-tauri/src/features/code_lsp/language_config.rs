use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};

use crate::shared::lsp_client::LspClientConfig;

#[derive(Debug, Clone)]
pub struct LanguageServerSpec {
    pub language_id: &'static str,
    pub binary_name: &'static str,
    pub args: &'static [&'static str],
}

const KNOWN_SERVERS: &[LanguageServerSpec] = &[
    LanguageServerSpec {
        language_id: "python",
        binary_name: "pyright-langserver",
        args: &["--stdio"],
    },
    LanguageServerSpec {
        language_id: "rust",
        binary_name: "rust-analyzer",
        args: &[],
    },
    LanguageServerSpec {
        language_id: "typescript",
        binary_name: "typescript-language-server",
        args: &["--stdio"],
    },
    LanguageServerSpec {
        language_id: "javascript",
        binary_name: "typescript-language-server",
        args: &["--stdio"],
    },
    LanguageServerSpec {
        language_id: "go",
        binary_name: "gopls",
        args: &[],
    },
    LanguageServerSpec {
        language_id: "json",
        binary_name: "vscode-json-language-server",
        args: &["--stdio"],
    },
    LanguageServerSpec {
        language_id: "yaml",
        binary_name: "yaml-language-server",
        args: &["--stdio"],
    },
];

pub fn ext_to_language_id(ext: &str) -> Option<&'static str> {
    match ext {
        "py" => Some("python"),
        "rs" => Some("rust"),
        "ts" | "tsx" => Some("typescript"),
        "js" | "jsx" => Some("javascript"),
        "go" => Some("go"),
        "json" => Some("json"),
        "yaml" | "yml" => Some("yaml"),
        _ => None,
    }
}

pub fn find_server_spec(language_id: &str) -> Option<&'static LanguageServerSpec> {
    KNOWN_SERVERS.iter().find(|s| s.language_id == language_id)
}

static BINARY_CACHE: LazyLock<Mutex<HashMap<String, Option<PathBuf>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn find_binary(binary_name: &str) -> Option<PathBuf> {
    {
        let cache = BINARY_CACHE.lock().expect("binary cache poisoned");
        if let Some(cached) = cache.get(binary_name) {
            return cached.clone();
        }
    }
    let resolved = resolve_binary_on_path(binary_name);
    BINARY_CACHE
        .lock()
        .expect("binary cache poisoned")
        .insert(binary_name.to_string(), resolved.clone());
    resolved
}

fn resolve_binary_on_path(binary_name: &str) -> Option<PathBuf> {
    std::process::Command::new("which")
        .arg(binary_name)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| PathBuf::from(s.trim()))
        .filter(|p| p.exists())
}

#[cfg(test)]
pub fn _reset_binary_cache_for_tests() {
    BINARY_CACHE
        .lock()
        .expect("binary cache poisoned")
        .clear();
}

pub fn build_lsp_config(
    spec: &LanguageServerSpec,
    binary_path: &PathBuf,
    root_uri: &str,
    working_dir: &str,
) -> LspClientConfig {
    LspClientConfig {
        binary_path: binary_path.to_string_lossy().into_owned(),
        args: spec.args.iter().map(|s| s.to_string()).collect(),
        root_uri: root_uri.to_string(),
        capabilities: serde_json::json!({
            "textDocument": {
                "synchronization": {
                    "didSave": true,
                    "dynamicRegistration": false
                },
                "publishDiagnostics": {
                    "relatedInformation": false
                },
                "hover": {
                    "dynamicRegistration": false,
                    "contentFormat": ["plaintext", "markdown"]
                },
                "completion": {
                    "dynamicRegistration": false,
                    "completionItem": {
                        "snippetSupport": false,
                        "documentationFormat": ["plaintext"]
                    }
                },
                "definition": {
                    "dynamicRegistration": false
                },
                "codeAction": {
                    "dynamicRegistration": false,
                    "codeActionLiteralSupport": {
                        "codeActionKind": {
                            "valueSet": ["", "quickfix", "refactor", "source"]
                        }
                    }
                }
            }
        }),
        working_dir: Some(working_dir.to_string()),
        request_timeout_ms: 30_000,
        init_timeout_ms: 30_000,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ext_to_language_known() {
        assert_eq!(ext_to_language_id("py"), Some("python"));
        assert_eq!(ext_to_language_id("rs"), Some("rust"));
        assert_eq!(ext_to_language_id("ts"), Some("typescript"));
        assert_eq!(ext_to_language_id("tsx"), Some("typescript"));
        assert_eq!(ext_to_language_id("js"), Some("javascript"));
        assert_eq!(ext_to_language_id("go"), Some("go"));
    }

    #[test]
    fn ext_to_language_unknown() {
        assert_eq!(ext_to_language_id("md"), None);
        assert_eq!(ext_to_language_id("txt"), None);
        assert_eq!(ext_to_language_id("pdf"), None);
    }

    #[test]
    fn find_spec_for_known_language() {
        let spec = find_server_spec("python").unwrap();
        assert_eq!(spec.binary_name, "pyright-langserver");
    }

    #[test]
    fn find_spec_for_unknown_language() {
        assert!(find_server_spec("haskell").is_none());
    }

    #[test]
    fn find_binary_caches_misses() {
        _reset_binary_cache_for_tests();
        let unique = "carbide-test-nonexistent-binary-xyz";
        let first = find_binary(unique);
        assert!(first.is_none());

        let cache_snapshot = BINARY_CACHE
            .lock()
            .expect("binary cache poisoned")
            .get(unique)
            .cloned();
        assert!(cache_snapshot.is_some(), "cache should have an entry");
        assert!(
            cache_snapshot.unwrap().is_none(),
            "cached value should be the negative result"
        );

        let second = find_binary(unique);
        assert!(second.is_none());
    }
}
