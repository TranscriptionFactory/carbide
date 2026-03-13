use std::path::{Path, Path_Buf};
use std::fs;
use crate::features::plugin::types::PluginManifest;
use anyhow::{Result, Context};

pub struct PluginService;

impl PluginService {
    pub fn new() -> Self {
        Self
    }

    pub fn discover(&self, vault_path: &Path) -> Result<Vec<PluginManifest>> {
        let plugins_dir = vault_path.join(".carbide").join("plugins");
        
        if !plugins_dir.exists() {
            return Ok(Vec::new());
        }

        let mut manifests = Vec::new();

        for entry in fs::read_dir(&plugins_dir).context("Failed to read plugins directory")? {
            let entry = entry?;
            let path = entry.path();
            
            if path.is_dir() {
                if let Some(manifest) = self.load_manifest(&path) {
                    manifests.push(manifest);
                }
            }
        }

        Ok(manifests)
    }

    fn load_manifest(&self, plugin_dir: &Path) -> Option<PluginManifest> {
        let manifest_path = plugin_dir.join("manifest.json");
        
        if !manifest_path.exists() {
            return None;
        }

        let content = fs::read_to_string(&manifest_path).ok()?;
        serde_json::from_str::<PluginManifest>(&content).ok()
    }
}
