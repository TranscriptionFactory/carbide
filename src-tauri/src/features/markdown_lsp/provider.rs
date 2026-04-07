use crate::features::toolchain;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Instant;
use tauri::{AppHandle, Manager};

use super::types::MarkdownLspProvider;

pub struct MarkdownLspStartupResolution {
    pub effective_provider: MarkdownLspProvider,
    pub binary_path: PathBuf,
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

pub async fn resolve_markdown_lsp_startup(
    app: &AppHandle,
    preferred: &str,
    custom_ref: Option<&str>,
    vault_path: &Path,
) -> Result<MarkdownLspStartupResolution, String> {
    match preferred {
        "iwes" => {
            let iwe_path = match toolchain::resolver::resolve(app, "iwes", custom_ref).await {
                Ok(path) => path,
                Err(error) => {
                    log::warn!(
                        "Markdown LSP requested_provider=iwes effective_provider=marksman reason=iwe_binary_resolution_failed error={}",
                        error
                    );
                    let marksman_path = toolchain::resolver::resolve(app, "marksman", None).await?;
                    return Ok(MarkdownLspStartupResolution {
                        effective_provider: MarkdownLspProvider::Marksman,
                        binary_path: marksman_path,
                    });
                }
            };

            log::info!("Resolved IWE language server: {}", iwe_path.display());

            match preflight_iwe_startup(vault_path, &iwe_path).await {
                Ok(()) => {
                    log::info!("Markdown LSP requested_provider=iwes effective_provider=iwes");
                    Ok(MarkdownLspStartupResolution {
                        effective_provider: MarkdownLspProvider::Iwes,
                        binary_path: iwe_path,
                    })
                }
                Err(error) => {
                    log::warn!(
                        "Markdown LSP requested_provider=iwes effective_provider=marksman reason=iwe_preflight_failed error={}",
                        error
                    );
                    let marksman_path = toolchain::resolver::resolve(app, "marksman", None).await?;
                    Ok(MarkdownLspStartupResolution {
                        effective_provider: MarkdownLspProvider::Marksman,
                        binary_path: marksman_path,
                    })
                }
            }
        }
        "marksman" => Ok(MarkdownLspStartupResolution {
            effective_provider: MarkdownLspProvider::Marksman,
            binary_path: toolchain::resolver::resolve(app, "marksman", custom_ref).await?,
        }),
        other => Err(format!("Unknown markdown LSP provider: {}", other)),
    }
}
