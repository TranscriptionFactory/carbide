use crate::features::plugin::types::{PluginInfo, PluginManifest};
use anyhow::{Context, Result};
use std::fs;
use std::path::{Path, PathBuf};

pub struct PluginService;

impl PluginService {
    pub fn new() -> Self {
        Self
    }

    pub fn discover(&self, vault_path: &Path) -> Result<Vec<PluginInfo>> {
        let plugins_dir = plugins_dir(vault_path);

        log::info!("Plugin discovery: looking in {}", plugins_dir.display());

        if !plugins_dir.exists() {
            log::info!("Plugin discovery: directory does not exist");
            return Ok(Vec::new());
        }

        let mut plugins = Vec::new();

        for entry in fs::read_dir(&plugins_dir).context("Failed to read plugins directory")? {
            let entry = entry?;
            let path = entry.path();

            if path.is_dir() {
                if let Some(manifest) = self.load_manifest(&path) {
                    plugins.push(PluginInfo {
                        manifest,
                        path: path.to_string_lossy().into_owned(),
                    });
                }
            }
        }

        Ok(plugins)
    }

    pub fn validate_plugin(&self, vault_path: &Path, plugin_id: &str) -> Result<PluginInfo> {
        let plugin_dir = plugins_dir(vault_path).join(plugin_id);

        if !plugin_dir.exists() {
            anyhow::bail!("Plugin directory not found: {}", plugin_dir.display());
        }

        let manifest = self.load_manifest(&plugin_dir).context(format!(
            "Failed to load manifest for plugin '{}'",
            plugin_id
        ))?;

        Ok(PluginInfo {
            manifest,
            path: plugin_dir.to_string_lossy().into_owned(),
        })
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

fn plugins_dir(vault_path: &Path) -> PathBuf {
    vault_path.join(".carbide").join("plugins")
}
