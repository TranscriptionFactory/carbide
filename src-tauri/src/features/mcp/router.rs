use serde_json::Value;
use tauri::AppHandle;

use crate::features::mcp::tools;
use crate::features::mcp::types::{
    InitializeParams, InitializeResult, JsonRpcError, JsonRpcRequest, JsonRpcResponse,
    ResourceDefinition, ServerCapabilities, ServerInfo, ToolCallParams, ToolDefinition, ToolResult,
    ToolsCapability, method, INTERNAL_ERROR, INVALID_PARAMS, METHOD_NOT_FOUND,
};

pub struct McpRouter {
    initialized: bool,
    app: Option<AppHandle>,
}

impl McpRouter {
    pub fn new() -> Self {
        Self {
            initialized: false,
            app: None,
        }
    }

    pub fn with_app(app: AppHandle) -> Self {
        Self {
            initialized: false,
            app: Some(app),
        }
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

    pub fn tool_definitions_public(&self) -> Vec<ToolDefinition> {
        self.get_tool_definitions()
    }

    pub fn dispatch_tool_public(&self, name: &str, arguments: Option<&Value>) -> ToolResult {
        self.dispatch_tool(name, arguments)
    }

    fn get_tool_definitions(&self) -> Vec<ToolDefinition> {
        let mut defs = tools::notes::tool_definitions();
        defs.extend(tools::search::tool_definitions());
        defs.extend(tools::metadata::tool_definitions());
        defs.extend(tools::vault::tool_definitions());
        defs.extend(tools::graph::tool_definitions());
        defs.extend(tools::references::tool_definitions());
        defs.extend(tools::git::tool_definitions());
        defs
    }

    fn dispatch_tool(&self, name: &str, arguments: Option<&Value>) -> ToolResult {
        let app = match &self.app {
            Some(a) => a,
            None => return ToolResult::error("No app context available".into()),
        };

        if let Some(result) = tools::notes::dispatch(app, name, arguments) {
            return result;
        }
        if let Some(result) = tools::search::dispatch(app, name, arguments) {
            return result;
        }
        if let Some(result) = tools::metadata::dispatch(app, name, arguments) {
            return result;
        }
        if let Some(result) = tools::vault::dispatch(app, name, arguments) {
            return result;
        }
        if let Some(result) = tools::graph::dispatch(app, name, arguments) {
            return result;
        }
        if let Some(result) = tools::references::dispatch(app, name, arguments) {
            return result;
        }
        if let Some(result) = tools::git::dispatch(app, name, arguments) {
            return result;
        }

        ToolResult::error(format!("Unknown tool: {}", name))
    }
}

impl Default for McpRouter {
    fn default() -> Self {
        Self::new()
    }
}
