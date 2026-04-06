use serde::Serialize;
use serde_json::Value;
use specta::Type;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::{watch, Mutex};

use crate::features::mcp::router::McpRouter;
use crate::features::mcp::transport::run_jsonrpc_stream;

#[derive(Debug, Clone, Serialize, Type, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum McpServerStatus {
    Stopped,
    Running,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct McpStatusInfo {
    pub status: McpServerStatus,
    pub transport: Option<String>,
}

pub struct McpState {
    status: Arc<Mutex<McpServerStatus>>,
    shutdown_tx: Arc<Mutex<Option<watch::Sender<bool>>>>,
    task_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

impl Default for McpState {
    fn default() -> Self {
        Self {
            status: Arc::new(Mutex::new(McpServerStatus::Stopped)),
            shutdown_tx: Arc::new(Mutex::new(None)),
            task_handle: Arc::new(Mutex::new(None)),
        }
    }
}

impl McpState {
    pub async fn start_stdio(&self, app: AppHandle) -> Result<McpStatusInfo, String> {
        let mut status = self.status.lock().await;
        if *status == McpServerStatus::Running {
            return Ok(McpStatusInfo {
                status: McpServerStatus::Running,
                transport: Some("stdio".into()),
            });
        }

        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let router = Arc::new(tokio::sync::Mutex::new(McpRouter::with_app(app)));

        let stdin = tokio::io::stdin();
        let stdout = tokio::io::stdout();
        let reader = tokio::io::BufReader::new(stdin);

        let handle = tokio::spawn(async move {
            if let Err(e) = run_jsonrpc_stream(reader, stdout, router, shutdown_rx).await {
                log::error!("MCP stdio server error: {}", e);
            }
            log::info!("MCP stdio server task exited");
        });

        *self.shutdown_tx.lock().await = Some(shutdown_tx);
        *self.task_handle.lock().await = Some(handle);
        *status = McpServerStatus::Running;

        log::info!("MCP stdio server started");

        Ok(McpStatusInfo {
            status: McpServerStatus::Running,
            transport: Some("stdio".into()),
        })
    }

    pub async fn stop(&self) -> Result<(), String> {
        let mut status = self.status.lock().await;
        if *status == McpServerStatus::Stopped {
            return Ok(());
        }

        if let Some(tx) = self.shutdown_tx.lock().await.take() {
            let _ = tx.send(true);
        }

        if let Some(handle) = self.task_handle.lock().await.take() {
            let _ = tokio::time::timeout(std::time::Duration::from_secs(5), handle).await;
        }

        *status = McpServerStatus::Stopped;
        log::info!("MCP server stopped");

        Ok(())
    }

    pub async fn get_status(&self) -> McpStatusInfo {
        let status = self.status.lock().await.clone();
        let transport = if status == McpServerStatus::Running {
            Some("stdio".into())
        } else {
            None
        };
        McpStatusInfo { status, transport }
    }

    pub async fn shutdown(&self) {
        if let Err(e) = self.stop().await {
            log::error!("MCP shutdown error: {}", e);
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_start(
    app: AppHandle,
    state: tauri::State<'_, McpState>,
) -> Result<McpStatusInfo, String> {
    state.start_stdio(app).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_stop(state: tauri::State<'_, McpState>) -> Result<(), String> {
    state.stop().await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_status(state: tauri::State<'_, McpState>) -> Result<McpStatusInfo, String> {
    Ok(state.get_status().await)
}

#[tauri::command]
pub fn mcp_list_tool_definitions() -> Result<Value, String> {
    let router = McpRouter::new();
    let defs = router.tool_definitions_public();
    serde_json::to_value(defs).map_err(|e| format!("Serialization error: {}", e))
}

#[tauri::command]
pub fn mcp_call_tool(
    app: AppHandle,
    tool_name: String,
    arguments: Option<Value>,
) -> Result<Value, String> {
    let router = McpRouter::with_app(app);
    let result = router.dispatch_tool_public(&tool_name, arguments.as_ref());
    serde_json::to_value(result).map_err(|e| format!("Serialization error: {}", e))
}
