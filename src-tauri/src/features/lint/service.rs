use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::Mutex;

use super::lsp::LintLspSession;
use super::types::*;
use crate::features::toolchain;

#[derive(Default)]
pub struct LintState {
    pub inner: Arc<Mutex<HashMap<String, VaultLintSession>>>,
}

pub struct VaultLintSession {
    pub client: LintLspSession,
    pub vault_path: PathBuf,
    pub status: LintStatus,
}

impl LintState {
    pub async fn start_session(
        &self,
        vault_id: &str,
        vault_path: PathBuf,
        browse_mode: bool,
        app: AppHandle,
    ) -> Result<(), String> {
        self.stop_session(vault_id).await?;

        let binary_path = toolchain::resolver::resolve(&app, "rumdl", None).await?;

        let client = LintLspSession::start(
            vault_id.to_string(),
            vault_path.clone(),
            binary_path,
            browse_mode,
            app,
        )
        .await?;

        let session = VaultLintSession {
            client,
            vault_path,
            status: LintStatus::Running,
        };

        self.inner
            .lock()
            .await
            .insert(vault_id.to_string(), session);
        Ok(())
    }

    pub async fn stop_session(&self, vault_id: &str) -> Result<(), String> {
        let session = self.inner.lock().await.remove(vault_id);
        if let Some(session) = session {
            session.client.stop().await;
        }
        Ok(())
    }

    pub async fn get_status(&self, vault_id: &str) -> LintStatus {
        match self.inner.lock().await.get(vault_id) {
            Some(session) => session.status.clone(),
            None => LintStatus::Stopped,
        }
    }
}
