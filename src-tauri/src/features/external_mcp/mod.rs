mod client;
pub mod manager;
mod types;

pub use manager::ExternalMcpState;
pub use types::ExternalMcpStatus;

use std::collections::HashMap;

#[tauri::command]
pub async fn external_mcp_start(
    state: tauri::State<'_, ExternalMcpState>,
    server_id: String,
    binary: String,
    args: Vec<String>,
    env_vars: HashMap<String, String>,
    working_dir: Option<String>,
) -> Result<(), String> {
    let config = types::ExternalMcpConfig {
        binary,
        args,
        env_vars: env_vars.into_iter().collect(),
        working_dir,
        request_timeout_ms: 120_000,
        init_timeout_ms: 30_000,
    };
    state
        .start(server_id, config)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn external_mcp_stop(
    state: tauri::State<'_, ExternalMcpState>,
    server_id: String,
) -> Result<(), String> {
    state.stop(&server_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn external_mcp_call_tool(
    state: tauri::State<'_, ExternalMcpState>,
    server_id: String,
    tool_name: String,
    arguments: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    state
        .call_tool(
            &server_id,
            &tool_name,
            arguments.unwrap_or(serde_json::json!({})),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn external_mcp_status(
    state: tauri::State<'_, ExternalMcpState>,
    server_id: String,
) -> Result<ExternalMcpStatus, String> {
    Ok(state.status(&server_id).await)
}
