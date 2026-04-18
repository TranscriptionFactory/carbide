use crate::features::plugin::types::{PluginInfo, PluginManifest};
use anyhow::{Context, Result};
use std::fs;
use std::path::{Path, PathBuf};

pub struct PluginService;

impl PluginService {
    pub fn new() -> Self {
        Self
    }

    pub fn discover(&self, vault_path: &Path, home_dir: &Path) -> Result<Vec<PluginInfo>> {
        let mut plugins_by_id = std::collections::HashMap::<String, PluginInfo>::new();

        let user_dir = user_plugins_dir(home_dir);
        if user_dir.exists() {
            log::info!("Plugin discovery: scanning user dir {}", user_dir.display());
            for info in self.discover_from_dir(&user_dir, "user")? {
                plugins_by_id.insert(info.manifest.id.clone(), info);
            }
        }

        let vault_dir = vault_plugins_dir(vault_path);
        if vault_dir.exists() {
            log::info!(
                "Plugin discovery: scanning vault dir {}",
                vault_dir.display()
            );
            for info in self.discover_from_dir(&vault_dir, "local")? {
                plugins_by_id.insert(info.manifest.id.clone(), info);
            }
        }

        Ok(plugins_by_id.into_values().collect())
    }

    fn discover_from_dir(&self, dir: &Path, source: &str) -> Result<Vec<PluginInfo>> {
        let mut plugins = Vec::new();

        for entry in fs::read_dir(dir).context("Failed to read plugins directory")? {
            let entry = entry?;
            let path = entry.path();

            if path.is_dir() {
                if let Some(manifest) = self.load_manifest(&path) {
                    plugins.push(PluginInfo {
                        manifest,
                        path: path.to_string_lossy().into_owned(),
                        source: source.to_string(),
                    });
                }
            }
        }

        Ok(plugins)
    }

    pub fn validate_plugin(
        &self,
        vault_path: &Path,
        home_dir: &Path,
        plugin_id: &str,
    ) -> Result<PluginInfo> {
        let vault_dir = vault_plugins_dir(vault_path).join(plugin_id);
        if vault_dir.exists() {
            let manifest = self.load_manifest(&vault_dir).context(format!(
                "Failed to load manifest for plugin '{}'",
                plugin_id
            ))?;
            return Ok(PluginInfo {
                manifest,
                path: vault_dir.to_string_lossy().into_owned(),
                source: "local".to_string(),
            });
        }

        let user_dir = user_plugins_dir(home_dir).join(plugin_id);
        if user_dir.exists() {
            let manifest = self.load_manifest(&user_dir).context(format!(
                "Failed to load manifest for plugin '{}'",
                plugin_id
            ))?;
            return Ok(PluginInfo {
                manifest,
                path: user_dir.to_string_lossy().into_owned(),
                source: "user".to_string(),
            });
        }

        anyhow::bail!(
            "Plugin directory not found for '{}' in vault or user plugins",
            plugin_id
        );
    }

    fn load_manifest(&self, plugin_dir: &Path) -> Option<PluginManifest> {
        let manifest_path = plugin_dir.join("manifest.json");
        let content = fs::read_to_string(&manifest_path).ok()?;
        match serde_json::from_str::<PluginManifest>(&content) {
            Ok(manifest) => Some(manifest),
            Err(e) => {
                log::warn!(
                    "Failed to parse plugin manifest at {}: {}",
                    manifest_path.display(),
                    e
                );
                None
            }
        }
    }
}

fn vault_plugins_dir(vault_path: &Path) -> PathBuf {
    vault_path.join(".carbide").join("plugins")
}

pub fn user_plugins_dir(home_dir: &Path) -> PathBuf {
    home_dir.join(".carbide").join("plugins")
}
