use crate::features::toolchain;
use crate::shared::lsp_client::provider::LspProvider;
use crate::shared::lsp_client::types::LspClientConfig;
use crate::shared::vault_path;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Instant;
use tauri::{AppHandle, Manager};

use super::types::MarkdownLspProvider;

pub struct MarkdownLspStartupResolution {
    pub effective_provider: MarkdownLspProvider,
    pub binary_path: PathBuf,
    pub lsp_provider: Box<dyn LspProvider>,
}

fn validate_iwe_working_dir(vault_path: &Path) -> Result<(), String> {
    let metadata =
        std::fs::metadata(vault_path).map_err(|e| format!("IWE vault cwd unusable: {}", e))?;
    if !metadata.is_dir() {
        return Err(format!(
            "IWE vault cwd unusable: {} is not a directory",
            vault_path.display()
        ));
    }
    if vault_path.to_str().is_none() {
        return Err("IWE vault cwd unusable: invalid vault path encoding".to_string());
    }
    Ok(())
}

async fn preflight_iwe_startup(vault_path: &Path, binary_path: &Path) -> Result<(), String> {
    let started_at = Instant::now();
    validate_iwe_working_dir(vault_path)?;
    let mut child = tokio::process::Command::new(binary_path)
        .current_dir(vault_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("IWE process startup failed: {}", e))?;
    let _ = child.start_kill();
    let _ = child.wait().await;
    log::info!(
        "markdown_lsp_startup phase=preflight_iwe_startup duration_ms={}",
        started_at.elapsed().as_millis()
    );
    Ok(())
}

pub async fn ensure_iwe_config(app: &AppHandle, vault_path: &Path) -> Result<(), String> {
    let iwe_dir = vault_path.join(".iwe");
    let iwe_config = iwe_dir.join("config.toml");
    let needs_copy = if iwe_config.exists() {
        let content = std::fs::read_to_string(&iwe_config).unwrap_or_default();
        !content.contains("[commands]")
    } else {
        true
    };
    if needs_copy {
        if let Ok(default_config) = app.path().resolve(
            "resources/iwe-default-config.toml",
            tauri::path::BaseDirectory::Resource,
        ) {
            std::fs::create_dir_all(&iwe_dir)
                .map_err(|e| format!("Failed to create .iwe directory: {}", e))?;
            std::fs::copy(&default_config, &iwe_config)
                .map_err(|e| format!("Failed to copy default IWE config: {}", e))?;
            log::info!("Wrote IWE config at {}", iwe_config.display());
        }
    }
    log::info!("IWE config path: {}", iwe_config.display());
    Ok(())
}

pub struct IweProvider;

#[async_trait::async_trait]
impl LspProvider for IweProvider {
    fn id(&self) -> &str {
        "iwes"
    }

    fn label(&self) -> &str {
        "IWE"
    }

    async fn resolve_binary(
        &self,
        app: &AppHandle,
        custom_path: Option<&str>,
    ) -> Result<PathBuf, String> {
        toolchain::resolver::resolve(app, "iwes", custom_path).await
    }

    fn build_config(
        &self,
        binary_path: &Path,
        root_uri: &str,
        working_dir: &str,
    ) -> LspClientConfig {
        LspClientConfig {
            binary_path: binary_path.to_string_lossy().into_owned(),
            args: vec![],
            root_uri: root_uri.to_string(),
            capabilities: serde_json::json!({
                "textDocument": {
                    "codeAction": {
                        "codeActionLiteralSupport": {
                            "codeActionKind": {
                                "valueSet": [
                                    "quickfix", "refactor", "refactor.extract",
                                    "refactor.inline", "refactor.rewrite",
                                    "source", "source.organizeImports"
                                ]
                            }
                        },
                        "resolveSupport": {
                            "properties": ["edit"]
                        }
                    },
                    "completion": {
                        "completionItem": {
                            "snippetSupport": false,
                            "resolveSupport": { "properties": ["documentation", "detail"] }
                        }
                    },
                    "hover": { "contentFormat": ["markdown", "plaintext"] },
                    "formatting": { "dynamicRegistration": false },
                    "synchronization": {
                        "didSave": true,
                        "willSave": false
                    },
                    "rename": { "prepareSupport": true },
                    "documentSymbol": {
                        "hierarchicalDocumentSymbolSupport": true
                    },
                    "inlayHint": { "dynamicRegistration": false },
                    "foldingRange": { "dynamicRegistration": false }
                },
                "workspace": {
                    "workspaceEdit": {
                        "documentChanges": true,
                        "resourceOperations": ["create", "rename", "delete"]
                    },
                    "symbol": { "dynamicRegistration": false },
                    "workspaceFolders": false
                }
            }),
            working_dir: Some(working_dir.to_string()),
            request_timeout_ms: 30_000,
            init_timeout_ms: 30_000,
        }
    }

    async fn on_pre_start(
        &self,
        app: &AppHandle,
        vault_path: &Path,
    ) -> Result<(), String> {
        ensure_iwe_config(app, vault_path).await
    }

    fn completion_trigger_characters(&self) -> Vec<String> {
        vec!["+".to_string(), "[".to_string(), "(".to_string()]
    }

    fn supports_workspace_edit(&self) -> bool {
        true
    }

    fn config_path(&self, vault_path: &Path) -> Option<PathBuf> {
        Some(vault_path.join(".iwe").join("config.toml"))
    }

    async fn reset_config(&self, app: &AppHandle, vault_path: &Path) -> Result<(), String> {
        let iwe_dir = vault_path.join(".iwe");
        let config_path = iwe_dir.join("config.toml");

        let default_config = app
            .path()
            .resolve(
                "resources/iwe-default-config.toml",
                tauri::path::BaseDirectory::Resource,
            )
            .map_err(|e| format!("Failed to resolve default config: {}", e))?;

        tokio::fs::create_dir_all(&iwe_dir)
            .await
            .map_err(|e| format!("Failed to create .iwe directory: {}", e))?;
        tokio::fs::copy(&default_config, &config_path)
            .await
            .map_err(|e| format!("Failed to copy default config: {}", e))?;

        log::info!("Reset IWE config at {}", config_path.display());
        Ok(())
    }
}

pub struct MarkdownOxideProvider;

#[async_trait::async_trait]
impl LspProvider for MarkdownOxideProvider {
    fn id(&self) -> &str {
        "markdown-oxide"
    }

    fn label(&self) -> &str {
        "Markdown Oxide"
    }

    async fn resolve_binary(
        &self,
        app: &AppHandle,
        custom_path: Option<&str>,
    ) -> Result<PathBuf, String> {
        toolchain::resolver::resolve(app, "markdown-oxide", custom_path).await
    }

    fn build_config(
        &self,
        binary_path: &Path,
        root_uri: &str,
        working_dir: &str,
    ) -> LspClientConfig {
        LspClientConfig {
            binary_path: binary_path.to_string_lossy().into_owned(),
            args: vec![],
            root_uri: root_uri.to_string(),
            capabilities: serde_json::json!({
                "textDocument": {
                    "completion": {
                        "completionItem": {
                            "snippetSupport": false,
                            "resolveSupport": { "properties": ["documentation", "detail"] }
                        }
                    },
                    "hover": { "contentFormat": ["markdown", "plaintext"] },
                    "synchronization": {
                        "didSave": true,
                        "willSave": false
                    },
                    "rename": { "prepareSupport": true },
                    "references": {},
                    "definition": {},
                    "codeAction": {
                        "codeActionLiteralSupport": {
                            "codeActionKind": {
                                "valueSet": ["quickfix", "refactor", "source"]
                            }
                        }
                    },
                    "documentSymbol": {
                        "hierarchicalDocumentSymbolSupport": true
                    }
                },
                "workspace": {
                    "symbol": { "dynamicRegistration": false },
                    "workspaceFolders": false
                }
            }),
            working_dir: Some(working_dir.to_string()),
            request_timeout_ms: 30_000,
            init_timeout_ms: 30_000,
        }
    }

    async fn on_pre_start(
        &self,
        app: &AppHandle,
        vault_path: &Path,
    ) -> Result<(), String> {
        let moxide_config = vault_path.join(".moxide.toml");
        if !moxide_config.exists() {
            if let Ok(default_config) = app.path().resolve(
                "resources/markdown-oxide-default-config.toml",
                tauri::path::BaseDirectory::Resource,
            ) {
                std::fs::copy(&default_config, &moxide_config)
                    .map_err(|e| format!("Failed to copy default .moxide.toml: {}", e))?;
            } else {
                let content = "# Generated by Carbide\n";
                std::fs::write(&moxide_config, content)
                    .map_err(|e| format!("Failed to write .moxide.toml: {}", e))?;
            }
            log::info!("Wrote .moxide.toml at {}", moxide_config.display());
        }
        Ok(())
    }

    fn completion_trigger_characters(&self) -> Vec<String> {
        vec![
            "[".to_string(),
            "(".to_string(),
            "#".to_string(),
            "^".to_string(),
        ]
    }

    fn config_path(&self, vault_path: &Path) -> Option<PathBuf> {
        Some(vault_path.join(".moxide.toml"))
    }

    async fn reset_config(&self, app: &AppHandle, vault_path: &Path) -> Result<(), String> {
        let config_path = vault_path.join(".moxide.toml");
        let default_config = app
            .path()
            .resolve(
                "resources/markdown-oxide-default-config.toml",
                tauri::path::BaseDirectory::Resource,
            )
            .map_err(|e| format!("Failed to resolve default config: {}", e))?;

        tokio::fs::copy(&default_config, &config_path)
            .await
            .map_err(|e| format!("Failed to copy default config: {}", e))?;

        log::info!("Reset .moxide.toml at {}", config_path.display());
        Ok(())
    }
}

pub struct MarksmanProvider;

#[async_trait::async_trait]
impl LspProvider for MarksmanProvider {
    fn id(&self) -> &str {
        "marksman"
    }

    fn label(&self) -> &str {
        "Marksman"
    }

    async fn resolve_binary(
        &self,
        app: &AppHandle,
        custom_path: Option<&str>,
    ) -> Result<PathBuf, String> {
        toolchain::resolver::resolve(app, "marksman", custom_path).await
    }

    fn build_config(
        &self,
        binary_path: &Path,
        root_uri: &str,
        working_dir: &str,
    ) -> LspClientConfig {
        LspClientConfig {
            binary_path: binary_path.to_string_lossy().into_owned(),
            args: vec![],
            root_uri: root_uri.to_string(),
            capabilities: serde_json::json!({
                "textDocument": {
                    "completion": {
                        "completionItem": {
                            "snippetSupport": false,
                            "resolveSupport": { "properties": ["documentation", "detail"] }
                        }
                    },
                    "hover": { "contentFormat": ["markdown", "plaintext"] },
                    "synchronization": {
                        "didSave": true,
                        "willSave": false
                    },
                    "rename": { "prepareSupport": true },
                    "documentSymbol": {
                        "hierarchicalDocumentSymbolSupport": true
                    }
                },
                "workspace": {
                    "symbol": { "dynamicRegistration": false },
                    "workspaceFolders": false
                }
            }),
            working_dir: Some(working_dir.to_string()),
            request_timeout_ms: 30_000,
            init_timeout_ms: 30_000,
        }
    }

    fn completion_trigger_characters(&self) -> Vec<String> {
        vec!["[".to_string(), "(".to_string(), "#".to_string()]
    }

    fn config_path(&self, vault_path: &Path) -> Option<PathBuf> {
        Some(vault_path.join(".marksman.toml"))
    }

    async fn reset_config(&self, app: &AppHandle, vault_path: &Path) -> Result<(), String> {
        let config_path = vault_path.join(".marksman.toml");
        let default_config = app
            .path()
            .resolve(
                "resources/marksman-default-config.toml",
                tauri::path::BaseDirectory::Resource,
            )
            .map_err(|e| format!("Failed to resolve default config: {}", e))?;

        tokio::fs::copy(&default_config, &config_path)
            .await
            .map_err(|e| format!("Failed to copy default config: {}", e))?;

        log::info!("Reset .marksman.toml at {}", config_path.display());
        Ok(())
    }
}

pub fn provider_for(id: MarkdownLspProvider) -> Box<dyn LspProvider> {
    match id {
        MarkdownLspProvider::Iwes => Box::new(IweProvider),
        MarkdownLspProvider::MarkdownOxide => Box::new(MarkdownOxideProvider),
        MarkdownLspProvider::Marksman => Box::new(MarksmanProvider),
    }
}

struct FallbackEntry {
    provider_id: MarkdownLspProvider,
    lsp_provider: Box<dyn LspProvider>,
}

pub async fn resolve_markdown_lsp_startup(
    app: &AppHandle,
    preferred: &str,
    custom_ref: Option<&str>,
    vault_path: &Path,
) -> Result<MarkdownLspStartupResolution, String> {
    let chain: Vec<FallbackEntry> = match preferred {
        "iwes" => vec![
            FallbackEntry {
                provider_id: MarkdownLspProvider::Iwes,
                lsp_provider: Box::new(IweProvider),
            },
            FallbackEntry {
                provider_id: MarkdownLspProvider::MarkdownOxide,
                lsp_provider: Box::new(MarkdownOxideProvider),
            },
            FallbackEntry {
                provider_id: MarkdownLspProvider::Marksman,
                lsp_provider: Box::new(MarksmanProvider),
            },
        ],
        "markdown_oxide" => vec![
            FallbackEntry {
                provider_id: MarkdownLspProvider::MarkdownOxide,
                lsp_provider: Box::new(MarkdownOxideProvider),
            },
            FallbackEntry {
                provider_id: MarkdownLspProvider::Marksman,
                lsp_provider: Box::new(MarksmanProvider),
            },
        ],
        "marksman" => vec![FallbackEntry {
            provider_id: MarkdownLspProvider::Marksman,
            lsp_provider: Box::new(MarksmanProvider),
        }],
        other => return Err(format!("Unknown markdown LSP provider: {}", other)),
    };

    let vault_risk = vault_path::analyze(vault_path);
    let mut last_error = String::new();

    for (i, entry) in chain.iter().enumerate() {
        let is_first = i == 0;
        let custom = if is_first { custom_ref } else { None };

        match entry.lsp_provider.resolve_binary(app, custom).await {
            Ok(binary_path) => {
                if matches!(entry.provider_id, MarkdownLspProvider::Iwes) {
                    match preflight_iwe_startup(vault_path, &binary_path).await {
                        Ok(()) => {}
                        Err(error) => {
                            log_fallback(
                                preferred,
                                entry.provider_id.as_str(),
                                "preflight_failed",
                                &error,
                                &vault_risk,
                            );
                            last_error = error;
                            continue;
                        }
                    }
                }

                log::info!(
                    "Markdown LSP requested_provider={} effective_provider={}",
                    preferred,
                    entry.provider_id.as_str()
                );
                return Ok(MarkdownLspStartupResolution {
                    effective_provider: entry.provider_id,
                    binary_path,
                    lsp_provider: provider_for(entry.provider_id),
                });
            }
            Err(error) => {
                log_fallback(
                    preferred,
                    entry.provider_id.as_str(),
                    "binary_resolution_failed",
                    &error,
                    &vault_risk,
                );
                last_error = error;
            }
        }
    }

    Err(format!(
        "All markdown LSP providers failed. Last error: {}",
        last_error
    ))
}

fn log_fallback(
    requested: &str,
    attempted: &str,
    reason: &str,
    error: &str,
    vault_risk: &vault_path::VaultPathRisk,
) {
    if vault_risk.is_cloud_backed {
        log::warn!(
            "Markdown LSP requested_provider={} attempted_provider={} reason={} cloud_provider={} note=\"Cloud sync may cause indexing timeouts; consider a local vault copy\" error={}",
            requested,
            attempted,
            reason,
            vault_risk.cloud_provider.unwrap_or("unknown"),
            error
        );
    } else {
        log::warn!(
            "Markdown LSP requested_provider={} attempted_provider={} reason={} error={}",
            requested,
            attempted,
            reason,
            error
        );
    }
}
