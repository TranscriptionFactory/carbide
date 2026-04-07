pub mod metadata;
pub mod notes;
pub mod search;
pub mod vault;

use crate::features::mcp::shared_ops::OpError;
use crate::features::mcp::types::{PropertySchema, ToolResult};
use serde_json::Value;

pub fn parse_args<T: serde::de::DeserializeOwned>(
    arguments: Option<&Value>,
) -> Result<T, ToolResult> {
    let value = arguments.ok_or_else(|| ToolResult::error("Missing arguments".into()))?;
    serde_json::from_value(value.clone())
        .map_err(|e| ToolResult::error(format!("Invalid arguments: {}", e)))
}

pub fn prop(prop_type: &str, description: &str) -> PropertySchema {
    PropertySchema {
        prop_type: prop_type.into(),
        description: Some(description.into()),
        enum_values: None,
        default: None,
    }
}

pub fn op_err_to_tool_result(e: OpError) -> ToolResult {
    match e {
        OpError::NotFound(m)
        | OpError::BadRequest(m)
        | OpError::Conflict(m)
        | OpError::Internal(m) => ToolResult::error(m),
    }
}
