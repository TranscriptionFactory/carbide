use std::path::{Path, PathBuf};
use tauri::AppHandle;

use super::types::LspClientConfig;

#[async_trait::async_trait]
pub trait LspProvider: Send + Sync {
    fn id(&self) -> &str;

    fn label(&self) -> &str;

    async fn resolve_binary(
        &self,
        app: &AppHandle,
        custom_path: Option<&str>,
    ) -> Result<PathBuf, String>;

    fn build_config(
        &self,
        binary_path: &Path,
        root_uri: &str,
        working_dir: &str,
    ) -> LspClientConfig;

    async fn on_pre_start(
        &self,
        _app: &AppHandle,
        _vault_path: &Path,
    ) -> Result<(), String> {
        Ok(())
    }

    fn completion_trigger_characters(&self) -> Vec<String> {
        vec![]
    }

    fn supports_workspace_edit(&self) -> bool {
        false
    }

    fn config_path(&self, _vault_path: &Path) -> Option<PathBuf> {
        None
    }

    async fn reset_config(&self, _app: &AppHandle, _vault_path: &Path) -> Result<(), String> {
        Err("This provider has no config to reset".to_string())
    }
}
