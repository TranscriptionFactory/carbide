pub mod metadata;
pub mod notes;
pub mod search;
pub mod vault;

use crate::features::mcp::types::ToolResult;
use serde_json::Value;

pub fn parse_args<T: serde::de::DeserializeOwned>(
    arguments: Option<&Value>,
) -> Result<T, ToolResult> {
    let value = arguments.ok_or_else(|| ToolResult::error("Missing arguments".into()))?;
    serde_json::from_value(value.clone())
        .map_err(|e| ToolResult::error(format!("Invalid arguments: {}", e)))
}
