use serde_json::Value;
use std::collections::HashMap;

use super::{
    selector_allow_list, AgentInvocation, HarnessAdapter, HarnessEventParser, McpEndpoint,
    MCP_TOOL_PREFIX,
};
use crate::features::ai::agent_stream::{AgentEvent, AgentRunStats, ToolSelector};
use crate::features::mcp::types::ToolDefinition;

const INPUT_SUMMARY_MAX_CHARS: usize = 200;
const MCP_SERVER: &str = "carbide";
const MCP_TOKEN_ENV: &str = "CARBIDE_MCP_TOKEN";

#[derive(Default)]
pub struct CodexEventParser {
    tool_names: HashMap<String, String>,
    saw_result: bool,
}

impl CodexEventParser {
    pub fn parse_line(&mut self, line: &str) -> Vec<AgentEvent> {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            return Vec::new();
        };
        match value.get("type").and_then(Value::as_str) {
            Some("thread.started") => parse_thread_started(&value),
            Some("item.started") => self.parse_item(&value, false),
            Some("item.completed") => self.parse_item(&value, true),
            Some("turn.completed") => self.parse_turn_completed(),
            Some("turn.failed") | Some("thread.failed") => self.parse_failure(&value),
            _ => Vec::new(),
        }
    }

    fn parse_item(&mut self, value: &Value, completed: bool) -> Vec<AgentEvent> {
        let Some(item) = value.get("item") else {
            return Vec::new();
        };
        match item.get("type").and_then(Value::as_str) {
            Some("agent_message") if completed => item_text(item)
                .map(|delta| vec![AgentEvent::Text { delta }])
                .unwrap_or_default(),
            Some("reasoning") if completed => item_text(item)
                .map(|delta| vec![AgentEvent::Reasoning { delta }])
                .unwrap_or_default(),
            Some(kind @ ("command_execution" | "mcp_tool_call" | "web_search" | "file_change")) => {
                let id = item.get("id").and_then(Value::as_str);
                if completed {
                    let name = id
                        .and_then(|id| self.tool_names.get(id).cloned())
                        .unwrap_or_else(|| tool_name(kind, item));
                    vec![AgentEvent::ToolEnd {
                        name,
                        ok: tool_ok(item),
                        result_summary: None,
                    }]
                } else {
                    let name = tool_name(kind, item);
                    if let Some(id) = id {
                        self.tool_names.insert(id.to_string(), name.clone());
                    }
                    vec![AgentEvent::ToolStart {
                        name,
                        input_summary: tool_input_summary(kind, item),
                    }]
                }
            }
            _ => Vec::new(),
        }
    }

    fn parse_turn_completed(&mut self) -> Vec<AgentEvent> {
        self.saw_result = true;
        vec![AgentEvent::Done {
            stats: AgentRunStats {
                duration_ms: 0,
                num_turns: 1,
                total_cost_usd: 0.0,
            },
        }]
    }

    fn parse_failure(&mut self, value: &Value) -> Vec<AgentEvent> {
        self.saw_result = true;
        let message = value
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .or_else(|| value.get("message").and_then(Value::as_str))
            .unwrap_or("codex turn failed")
            .to_string();
        vec![AgentEvent::Error { message }]
    }
}

impl HarnessEventParser for CodexEventParser {
    fn parse_line(&mut self, line: &str) -> Vec<AgentEvent> {
        CodexEventParser::parse_line(self, line)
    }

    fn saw_result(&self) -> bool {
        self.saw_result
    }
}

fn parse_thread_started(value: &Value) -> Vec<AgentEvent> {
    let Some(thread_id) = value.get("thread_id").and_then(Value::as_str) else {
        return Vec::new();
    };
    vec![AgentEvent::Init {
        session_id: thread_id.to_string(),
    }]
}

fn item_text(item: &Value) -> Option<String> {
    item.get("text").and_then(Value::as_str).map(str::to_string)
}

fn tool_name(kind: &str, item: &Value) -> String {
    if kind == "mcp_tool_call" {
        let tool = item
            .get("invocation")
            .and_then(|invocation| invocation.get("tool"))
            .and_then(Value::as_str)
            .unwrap_or("tool");
        format!("{MCP_TOOL_PREFIX}{tool}")
    } else {
        kind.to_string()
    }
}

fn tool_input_summary(kind: &str, item: &Value) -> String {
    let raw = match kind {
        "mcp_tool_call" => item
            .get("invocation")
            .and_then(|invocation| invocation.get("arguments"))
            .map(Value::to_string),
        "command_execution" => item.get("command").and_then(Value::as_str).map(str::to_string),
        "web_search" => item.get("query").and_then(Value::as_str).map(str::to_string),
        _ => None,
    }
    .unwrap_or_default();
    truncate(&raw)
}

fn tool_ok(item: &Value) -> bool {
    if item.get("status").and_then(Value::as_str) == Some("failed") {
        return false;
    }
    match item.get("exit_code").and_then(Value::as_i64) {
        Some(code) => code == 0,
        None => true,
    }
}

fn truncate(raw: &str) -> String {
    let chars: Vec<char> = raw.chars().collect();
    if chars.len() <= INPUT_SUMMARY_MAX_CHARS {
        raw.to_string()
    } else {
        let head: String = chars[..INPUT_SUMMARY_MAX_CHARS].iter().collect();
        format!("{head}…")
    }
}

pub fn build_codex_args(
    prompt: &str,
    port: u16,
    selector: &ToolSelector,
    catalog: &[ToolDefinition],
) -> Result<Vec<String>, String> {
    let mut args: Vec<String> = ["exec", "--json", "--skip-git-repo-check", "--ignore-user-config"]
        .map(String::from)
        .to_vec();

    let url = format!("http://127.0.0.1:{port}/mcp");
    push_config(&mut args, &format!("mcp_servers.{MCP_SERVER}.url"), &toml_value(&url));
    push_config(
        &mut args,
        &format!("mcp_servers.{MCP_SERVER}.bearer_token_env_var"),
        &toml_value(MCP_TOKEN_ENV),
    );

    match selector_allow_list(selector, catalog) {
        Some(allowed) => {
            args.extend(["--sandbox", "read-only"].map(String::from));
            let bare: Vec<String> = allowed
                .iter()
                .map(|name| name.strip_prefix(MCP_TOOL_PREFIX).unwrap_or(name).to_string())
                .collect();
            let array = serde_json::to_string(&bare)
                .map_err(|e| format!("Failed to encode codex tool allow-list: {e}"))?;
            push_config(&mut args, &format!("mcp_servers.{MCP_SERVER}.enabled_tools"), &array);
        }
        None => {
            args.extend(["--sandbox", "workspace-write"].map(String::from));
        }
    }

    args.push("--".to_string());
    args.push(prompt.to_string());
    Ok(args)
}

fn push_config(args: &mut Vec<String>, key: &str, value: &str) {
    args.push("-c".to_string());
    args.push(format!("{key}={value}"));
}

fn toml_value(raw: &str) -> String {
    serde_json::to_string(raw).unwrap_or_else(|_| format!("\"{raw}\""))
}

pub struct CodexAdapter;

impl HarnessAdapter for CodexAdapter {
    const SUPPORTS_RESUME: bool = false;
    const SUPPORTS_PARTIAL_TEXT: bool = false;

    fn build_invocation(
        &self,
        prompt: &str,
        endpoint: &McpEndpoint,
        selector: &ToolSelector,
        catalog: &[ToolDefinition],
        _resume_session_id: Option<&str>,
    ) -> Result<AgentInvocation, String> {
        let args = build_codex_args(prompt, endpoint.port, selector, catalog)?;
        Ok(AgentInvocation {
            args,
            env: vec![(MCP_TOKEN_ENV.to_string(), endpoint.token.clone())],
        })
    }

    fn new_parser(&self) -> Box<dyn HarnessEventParser> {
        Box::new(CodexEventParser::default())
    }
}
