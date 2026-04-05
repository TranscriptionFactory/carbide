use serde_json::Value;

use crate::features::mcp::types::{
    InitializeParams, InitializeResult, JsonRpcError, JsonRpcRequest, JsonRpcResponse,
    ResourceDefinition, ServerCapabilities, ServerInfo, ToolCallParams, ToolDefinition, ToolResult,
    ToolsCapability, method, INTERNAL_ERROR, INVALID_PARAMS, METHOD_NOT_FOUND,
};

pub struct McpRouter {
    initialized: bool,
}

impl McpRouter {
    pub fn new() -> Self {
        Self { initialized: false }
    }

    pub fn handle_request(&mut self, request: &JsonRpcRequest) -> Option<JsonRpcResponse> {
        if let Err(err) = request.validate() {
            return Some(JsonRpcResponse::error(request.id.clone(), err));
        }

        if request.is_notification() {
            self.handle_notification(request);
            return None;
        }

        let result = match request.method.as_str() {
            method::INITIALIZE => self.handle_initialize(request.params.as_ref()),
            method::PING => Ok(serde_json::json!({})),
            method::TOOLS_LIST => self.handle_tools_list(),
            method::TOOLS_CALL => self.handle_tools_call(request.params.as_ref()),
            method::RESOURCES_LIST => self.handle_resources_list(),
            method::RESOURCES_READ => self.handle_resources_read(request.params.as_ref()),
            _ => Err(JsonRpcError {
                code: METHOD_NOT_FOUND,
                message: format!("Method not found: {}", request.method),
                data: None,
            }),
        };

        Some(match result {
            Ok(value) => JsonRpcResponse::success(request.id.clone(), value),
            Err(err) => JsonRpcResponse::error(request.id.clone(), err),
        })
    }

    fn handle_notification(&mut self, request: &JsonRpcRequest) {
        match request.method.as_str() {
            method::INITIALIZED => {
                log::info!("MCP client confirmed initialization");
            }
            _ => {
                log::debug!("Unknown MCP notification: {}", request.method);
            }
        }
    }

    fn handle_initialize(&mut self, params: Option<&Value>) -> Result<Value, JsonRpcError> {
        let _init_params: InitializeParams = params
            .map(|p| serde_json::from_value(p.clone()))
            .transpose()
            .map_err(|e| JsonRpcError {
                code: INVALID_PARAMS,
                message: format!("Invalid initialize params: {}", e),
                data: None,
            })?
            .ok_or_else(|| JsonRpcError {
                code: INVALID_PARAMS,
                message: "initialize requires params".into(),
                data: None,
            })?;

        self.initialized = true;

        let result = InitializeResult {
            protocol_version: "2024-11-05".into(),
            capabilities: ServerCapabilities {
                tools: Some(ToolsCapability {
                    list_changed: false,
                }),
                resources: None,
            },
            server_info: ServerInfo {
                name: "carbide".into(),
                version: env!("CARGO_PKG_VERSION").into(),
            },
        };

        serde_json::to_value(result).map_err(|e| JsonRpcError {
            code: INTERNAL_ERROR,
            message: format!("Serialization error: {}", e),
            data: None,
        })
    }

    fn handle_tools_list(&self) -> Result<Value, JsonRpcError> {
        let tools = self.get_tool_definitions();
        serde_json::to_value(serde_json::json!({ "tools": tools })).map_err(|e| JsonRpcError {
            code: INTERNAL_ERROR,
            message: format!("Serialization error: {}", e),
            data: None,
        })
    }

    fn handle_tools_call(&self, params: Option<&Value>) -> Result<Value, JsonRpcError> {
        let call_params: ToolCallParams = params
            .map(|p| serde_json::from_value(p.clone()))
            .transpose()
            .map_err(|e| JsonRpcError {
                code: INVALID_PARAMS,
                message: format!("Invalid tool call params: {}", e),
                data: None,
            })?
            .ok_or_else(|| JsonRpcError {
                code: INVALID_PARAMS,
                message: "tools/call requires params with name".into(),
                data: None,
            })?;

        let result = self.dispatch_tool(&call_params.name, call_params.arguments.as_ref());

        serde_json::to_value(result).map_err(|e| JsonRpcError {
            code: INTERNAL_ERROR,
            message: format!("Serialization error: {}", e),
            data: None,
        })
    }

    fn handle_resources_list(&self) -> Result<Value, JsonRpcError> {
        let resources: Vec<ResourceDefinition> = vec![];
        serde_json::to_value(serde_json::json!({ "resources": resources })).map_err(|e| {
            JsonRpcError {
                code: INTERNAL_ERROR,
                message: format!("Serialization error: {}", e),
                data: None,
            }
        })
    }

    fn handle_resources_read(&self, _params: Option<&Value>) -> Result<Value, JsonRpcError> {
        Err(JsonRpcError {
            code: METHOD_NOT_FOUND,
            message: "No resources available".into(),
            data: None,
        })
    }

    fn get_tool_definitions(&self) -> Vec<ToolDefinition> {
        // Tool definitions will be populated in unit 1.3 and 1.4.
        // For now, return empty — the dispatch skeleton is in place.
        vec![]
    }

    fn dispatch_tool(&self, name: &str, _arguments: Option<&Value>) -> ToolResult {
        // Tool handlers will be added in units 1.3 and 1.4.
        ToolResult::error(format!("Unknown tool: {}", name))
    }
}

impl Default for McpRouter {
    fn default() -> Self {
        Self::new()
    }
}
