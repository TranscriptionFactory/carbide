use serde_json::Value;
use std::collections::HashMap;

use super::{HarnessAdapter, HarnessEventParser};
use crate::features::ai::agent_stream::{AgentEvent, AgentPermissionMode, AgentRunStats};

const INPUT_SUMMARY_MAX_CHARS: usize = 200;

#[derive(Default)]
pub struct AgentEventParser {
    tool_names: HashMap<String, String>,
    saw_result: bool,
}

impl AgentEventParser {
    pub fn parse_line(&mut self, line: &str) -> Vec<AgentEvent> {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            return Vec::new();
        };
        match value.get("type").and_then(Value::as_str) {
            Some("system") => self.parse_system(&value),
            Some("stream_event") => self.parse_stream_event(&value),
            Some("assistant") => self.parse_assistant(&value),
            Some("user") => self.parse_user(&value),
            Some("result") => self.parse_result(&value),
            _ => Vec::new(),
        }
    }

    fn parse_system(&mut self, value: &Value) -> Vec<AgentEvent> {
        if value.get("subtype").and_then(Value::as_str) != Some("init") {
            return Vec::new();
        }
        let Some(session_id) = value.get("session_id").and_then(Value::as_str) else {
            return Vec::new();
        };
        vec![AgentEvent::Init {
            session_id: session_id.to_string(),
        }]
    }

    fn parse_stream_event(&mut self, value: &Value) -> Vec<AgentEvent> {
        let Some(delta) = value.get("event").and_then(|e| e.get("delta")) else {
            return Vec::new();
        };
        if delta.get("type").and_then(Value::as_str) != Some("text_delta") {
            return Vec::new();
        }
        let Some(text) = delta.get("text").and_then(Value::as_str) else {
            return Vec::new();
        };
        vec![AgentEvent::Text {
            delta: text.to_string(),
        }]
    }

    fn parse_assistant(&mut self, value: &Value) -> Vec<AgentEvent> {
        let Some(blocks) = message_content(value) else {
            return Vec::new();
        };
        blocks
            .iter()
            .filter(|b| b.get("type").and_then(Value::as_str) == Some("tool_use"))
            .filter_map(|b| {
                let name = b.get("name").and_then(Value::as_str)?.to_string();
                if let Some(id) = b.get("id").and_then(Value::as_str) {
                    self.tool_names.insert(id.to_string(), name.clone());
                }
                let input_summary = b
                    .get("input")
                    .map(|input| summarize_input(input))
                    .unwrap_or_default();
                Some(AgentEvent::ToolStart {
                    name,
                    input_summary,
                })
            })
            .collect()
    }

    fn parse_user(&mut self, value: &Value) -> Vec<AgentEvent> {
        let Some(blocks) = message_content(value) else {
            return Vec::new();
        };
        blocks
            .iter()
            .filter(|b| b.get("type").and_then(Value::as_str) == Some("tool_result"))
            .map(|b| {
                let name = b
                    .get("tool_use_id")
                    .and_then(Value::as_str)
                    .and_then(|id| self.tool_names.get(id).cloned())
                    .unwrap_or_else(|| "tool".to_string());
                let ok = !b.get("is_error").and_then(Value::as_bool).unwrap_or(false);
                AgentEvent::ToolEnd {
                    name,
                    ok,
                    result_summary: None,
                }
            })
            .collect()
    }

    fn parse_result(&mut self, value: &Value) -> Vec<AgentEvent> {
        self.saw_result = true;
        let is_error = value.get("is_error").and_then(Value::as_bool).unwrap_or(false);
        let subtype = value.get("subtype").and_then(Value::as_str);
        if is_error || subtype != Some("success") {
            let message = value
                .get("result")
                .and_then(Value::as_str)
                .or(subtype)
                .unwrap_or("agent run failed")
                .to_string();
            return vec![AgentEvent::Error { message }];
        }
        vec![AgentEvent::Done {
            stats: AgentRunStats {
                duration_ms: value.get("duration_ms").and_then(Value::as_u64).unwrap_or(0) as u32,
                num_turns: value.get("num_turns").and_then(Value::as_u64).unwrap_or(0) as u32,
                total_cost_usd: value
                    .get("total_cost_usd")
                    .and_then(Value::as_f64)
                    .unwrap_or(0.0),
            },
        }]
    }
}

impl HarnessEventParser for AgentEventParser {
    fn parse_line(&mut self, line: &str) -> Vec<AgentEvent> {
        AgentEventParser::parse_line(self, line)
    }

    fn saw_result(&self) -> bool {
        self.saw_result
    }
}

fn message_content(value: &Value) -> Option<&Vec<Value>> {
    value.get("message")?.get("content")?.as_array()
}

fn summarize_input(input: &Value) -> String {
    let raw = input.to_string();
    let chars: Vec<char> = raw.chars().collect();
    if chars.len() <= INPUT_SUMMARY_MAX_CHARS {
        raw
    } else {
        let head: String = chars[..INPUT_SUMMARY_MAX_CHARS].iter().collect();
        format!("{head}…")
    }
}

pub fn build_agent_args(
    prompt: &str,
    mcp_config_path: &str,
    permission_mode: &AgentPermissionMode,
    resume_session_id: Option<&str>,
) -> Vec<String> {
    let mut args: Vec<String> = [
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--strict-mcp-config",
        "--mcp-config",
        mcp_config_path,
    ]
    .map(String::from)
    .to_vec();
    match permission_mode {
        AgentPermissionMode::Safe => {
            args.extend(
                [
                    "--allowedTools",
                    "mcp__carbide__*",
                    "--disallowedTools",
                    "Bash",
                    "Write",
                    "Edit",
                ]
                .map(String::from),
            );
        }
        AgentPermissionMode::Power => {
            args.extend(["--permission-mode", "acceptEdits"].map(String::from));
        }
    }
    if let Some(id) = resume_session_id {
        args.extend(["--resume", id].map(String::from));
    }
    args
}

pub struct ClaudeAdapter;

impl HarnessAdapter for ClaudeAdapter {
    const SUPPORTS_RESUME: bool = true;
    const SUPPORTS_PARTIAL_TEXT: bool = true;

    fn spawn_args(
        &self,
        prompt: &str,
        mcp_config_path: &str,
        permission_mode: &AgentPermissionMode,
        resume_session_id: Option<&str>,
    ) -> Vec<String> {
        build_agent_args(prompt, mcp_config_path, permission_mode, resume_session_id)
    }

    fn new_parser(&self) -> Box<dyn HarnessEventParser> {
        Box::new(AgentEventParser::default())
    }
}
