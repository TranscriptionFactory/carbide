use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use super::client::ExternalMcpClient;
use super::types::{ExternalMcpConfig, ExternalMcpError, ExternalMcpStatus};

pub struct ExternalMcpState {
    clients: Arc<Mutex<HashMap<String, ExternalMcpClient>>>,
}

impl Default for ExternalMcpState {
    fn default() -> Self {
        Self {
            clients: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl ExternalMcpState {
    pub async fn start(
        &self,
        server_id: String,
        config: ExternalMcpConfig,
    ) -> Result<(), ExternalMcpError> {
        let mut clients = self.clients.lock().await;
        if let Some(existing) = clients.get(&server_id) {
            if existing.is_alive() {
                return Err(ExternalMcpError::AlreadyRunning(server_id));
            }
        }

        let client = ExternalMcpClient::start(config).await?;
        clients.insert(server_id, client);
        Ok(())
    }

    pub async fn stop(&self, server_id: &str) -> Result<(), ExternalMcpError> {
        let mut clients = self.clients.lock().await;
        let mut client = clients
            .remove(server_id)
            .ok_or_else(|| ExternalMcpError::ServerNotFound(server_id.to_string()))?;
        client.stop().await;
        Ok(())
    }

    pub async fn call_tool(
        &self,
        server_id: &str,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> Result<serde_json::Value, ExternalMcpError> {
        let clients = self.clients.lock().await;
        let client = clients
            .get(server_id)
            .ok_or_else(|| ExternalMcpError::ServerNotFound(server_id.to_string()))?;
        client.call_tool(tool_name, arguments).await
    }

    pub async fn status(&self, server_id: &str) -> ExternalMcpStatus {
        let clients = self.clients.lock().await;
        match clients.get(server_id) {
            Some(client) if client.is_alive() => ExternalMcpStatus::Running {
                tool_count: client.tool_count(),
            },
            Some(_) => ExternalMcpStatus::Error {
                message: "Process exited".to_string(),
            },
            None => ExternalMcpStatus::Stopped,
        }
    }

    pub async fn shutdown(&self) {
        let mut clients = self.clients.lock().await;
        for (id, mut client) in clients.drain() {
            log::info!("Shutting down external MCP server: {}", id);
            client.stop().await;
        }
    }
}
