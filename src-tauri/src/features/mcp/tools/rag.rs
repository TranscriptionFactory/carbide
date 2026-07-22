use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

use crate::features::mcp::rag_bridge::{RagBridgeState, RagQueryRequestEvent, RagQueryResponse};
use crate::features::mcp::shared_ops::{self, VAULT_ID_OPTIONAL_DESC};
use crate::features::mcp::tools::{op_err_to_tool_result, parse_args, prop};
use crate::features::mcp::types::{InputSchema, ToolDefinition, ToolResult};
use crate::features::search::service as search_service;

const RAG_QUERY_EVENT: &str = "rag://mcp-query";
const RAG_QUERY_TIMEOUT: Duration = Duration::from_secs(180);

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![rag_query_def(), rag_status_def()]
}

pub fn dispatch(app: &AppHandle, name: &str, arguments: Option<&Value>) -> Option<ToolResult> {
    match name {
        "rag_query" => Some(handle_rag_query(app, arguments)),
        "rag_status" => Some(handle_rag_status(app, arguments)),
        _ => None,
    }
}

#[derive(Default, Serialize, Deserialize)]
pub(crate) struct RagQueryArgs {
    pub question: String,
    #[serde(default)]
    pub vault_id: Option<String>,
    #[serde(default)]
    pub folder: Option<String>,
    #[serde(default)]
    pub tag: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
pub(crate) struct RagStatusArgs {
    #[serde(default)]
    pub vault_id: Option<String>,
}

fn rag_query_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert(
        "question".into(),
        prop(
            "string",
            "The question to answer by retrieving across the vault. Retrieval is question-driven; the answer cites the notes it used.",
        ),
    );
    properties.insert(
        "folder".into(),
        prop(
            "string",
            "Optional. Restrict retrieval to notes under this folder prefix.",
        ),
    );
    properties.insert(
        "tag".into(),
        prop(
            "string",
            "Optional. Restrict retrieval to notes carrying this tag.",
        ),
    );
    properties.insert("vault_id".into(), prop("string", VAULT_ID_OPTIONAL_DESC));

    ToolDefinition {
        name: "rag_query".into(),
        mutating: false,
        description: "Ask a question and get a cited answer retrieved across the whole vault, using the same retrieval and citation pipeline as the in-app Vault Chat. Retrieval always targets the vault of the running app's active session; if vault_id is provided it must match that active vault, otherwise the call is rejected. Returns the answer with [N] citation markers followed by a Sources list mapping each marker to a note path. Requires the Carbide desktop app to be running.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["question".into()],
        },
    }
}

fn rag_status_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", VAULT_ID_OPTIONAL_DESC));

    ToolDefinition {
        name: "rag_status".into(),
        mutating: false,
        description: "Report RAG readiness for a vault: embedding model version, how many notes are embedded, whether indexing is in progress, and whether the in-app query bridge is available.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec![],
        },
    }
}

fn format_rag_response(response: &RagQueryResponse) -> String {
    let mut text = response.answer.clone();
    if !response.citations.is_empty() {
        text.push_str("\n\nSources:\n");
        for citation in &response.citations {
            text.push_str(&format!(
                "[{}] {} — {}\n",
                citation.index, citation.note_path, citation.title
            ));
        }
    }
    text
}

fn handle_rag_query(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: RagQueryArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    if app.webview_windows().is_empty() {
        return ToolResult::error(
            "rag_query requires the Carbide desktop app to be running; the retrieval pipeline is not available in headless mode.".into(),
        );
    }

    if let Some(requested) = args.vault_id.as_deref().filter(|v| !v.trim().is_empty()) {
        match shared_ops::get_active_vault_id(app) {
            Ok(Some(active)) if active != requested => {
                return ToolResult::error(format!(
                    "vault_id '{}' does not match the active vault '{}'; rag_query only targets the active session.",
                    requested, active
                ));
            }
            Ok(_) => {}
            Err(e) => return op_err_to_tool_result(e),
        }
    }

    let bridge = app.state::<RagBridgeState>();
    let (id, rx) = bridge.register();

    let event = RagQueryRequestEvent {
        id,
        question: args.question,
        folder: args.folder,
        tag: args.tag,
    };
    if app.emit(RAG_QUERY_EVENT, event).is_err() {
        bridge.cancel(id);
        return ToolResult::error("Failed to dispatch the RAG query to the app.".into());
    }

    match rx.recv_timeout(RAG_QUERY_TIMEOUT) {
        Ok(response) => match response.error {
            Some(err) => ToolResult::error(format!("RAG query failed: {err}")),
            None => ToolResult::text(format_rag_response(&response)),
        },
        Err(_) => {
            bridge.cancel(id);
            ToolResult::error("RAG query timed out waiting for the app to respond.".into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::mcp::rag_bridge::RagCitationDto;

    #[test]
    fn formats_answer_with_a_sources_list() {
        let response = RagQueryResponse {
            answer: "It deploys nightly [1].".into(),
            citations: vec![RagCitationDto {
                index: 1,
                note_path: "notes/ops.md".into(),
                title: "Ops".into(),
            }],
            error: None,
        };
        let text = format_rag_response(&response);
        assert!(text.contains("It deploys nightly [1]."));
        assert!(text.contains("Sources:"));
        assert!(text.contains("[1] notes/ops.md — Ops"));
    }

    #[test]
    fn omits_sources_when_there_are_no_citations() {
        let response = RagQueryResponse {
            answer: "No vault evidence.".into(),
            citations: vec![],
            error: None,
        };
        let text = format_rag_response(&response);
        assert_eq!(text, "No vault evidence.");
        assert!(!text.contains("Sources:"));
    }
}

fn handle_rag_status(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: RagStatusArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    let vault_id = match shared_ops::resolve_vault_id(app, args.vault_id) {
        Ok(v) => v,
        Err(e) => return op_err_to_tool_result(e),
    };

    let bridge_available = !app.webview_windows().is_empty();

    match search_service::get_embedding_status(app.clone(), vault_id.clone()) {
        Ok(status) => ToolResult::text(format!(
            "RAG status for vault {}\nEmbedding model: {}\nEmbedded notes: {}/{}\nIndexing in progress: {}\nIn-app query bridge available: {}",
            vault_id,
            status.model_version,
            status.embedded_notes,
            status.total_notes,
            status.is_embedding,
            bridge_available,
        )),
        Err(e) => ToolResult::error(format!("Failed to read RAG status: {e}")),
    }
}
