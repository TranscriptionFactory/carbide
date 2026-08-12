use std::collections::HashMap;

use agent_client_protocol::schema::v1::{
    ContentBlock, SessionUpdate, ToolCall, ToolCallContent, ToolCallLocation,
    ToolCallStatus as AcpToolCallStatus, ToolCallUpdate, ToolKind as AcpToolKind,
};

use crate::features::ai::agent_stream::{
    infer_tool_kind, summarize_chars, summarize_json, AgentEvent, ToolCallStatus, ToolContent,
    ToolKind, ToolLocation,
};
use crate::features::ai::harness::{strip_mcp_prefix, MutatingToolSet};
use crate::features::ai::tool_paths::{extract_tool_paths, push_unique};

const SUMMARY_LIMIT: usize = 200;

/// Per-call bookkeeping so the terminal `ToolEnd` can re-state the union of
/// everything the call touched, not just what its last update carried.
struct CallState {
    name: String,
    paths: Vec<String>,
    mutating: bool,
    status: ToolCallStatus,
}

pub struct TurnTranslator {
    mutating: MutatingToolSet,
    calls: HashMap<String, CallState>,
}

impl TurnTranslator {
    pub fn new(mutating: MutatingToolSet) -> Self {
        Self {
            mutating,
            calls: HashMap::new(),
        }
    }

    /// A cancelled or crashed turn strands per-call state no update will ever
    /// settle; the session actor calls this at every turn boundary.
    pub fn clear_open_calls(&mut self) {
        self.calls.clear();
    }

    pub fn on_update(&mut self, update: &SessionUpdate) -> Vec<AgentEvent> {
        match update {
            SessionUpdate::AgentMessageChunk(chunk) => block_text(&chunk.content)
                .map(|delta| AgentEvent::Text { delta })
                .into_iter()
                .collect(),
            SessionUpdate::AgentThoughtChunk(chunk) => block_text(&chunk.content)
                .map(|delta| AgentEvent::Reasoning { delta })
                .into_iter()
                .collect(),
            SessionUpdate::ToolCall(call) => vec![self.on_tool_call(call)],
            SessionUpdate::ToolCallUpdate(update) => self.on_tool_call_update(update),
            _ => Vec::new(),
        }
    }

    fn on_tool_call(&mut self, call: &ToolCall) -> AgentEvent {
        let id = call.tool_call_id.to_string();
        let name = call.title.clone();
        let kind = resolve_kind(Some(call.kind), &name);

        let paths = collect_paths(
            Some(&call.locations),
            Some(&call.content),
            call.raw_input.as_ref(),
        );

        let mutating = is_mutating_kind(kind)
            || matches_mutating(&self.mutating, &name)
            || has_diff(&call.content);

        let status = map_status(call.status);
        self.calls.insert(
            id.clone(),
            CallState {
                name: name.clone(),
                paths: paths.clone(),
                mutating,
                status,
            },
        );

        AgentEvent::ToolStart {
            id,
            name,
            kind,
            input_summary: call
                .raw_input
                .as_ref()
                .map(|input| summarize_chars(&input.to_string(), SUMMARY_LIMIT))
                .unwrap_or_default(),
            paths,
            mutating,
            locations: call.locations.iter().map(map_location).collect(),
        }
    }

    fn on_tool_call_update(&mut self, update: &ToolCallUpdate) -> Vec<AgentEvent> {
        let id = update.tool_call_id.to_string();
        let fields = &update.fields;

        let paths = collect_paths(
            fields.locations.as_deref(),
            fields.content.as_deref(),
            fields.raw_input.as_ref(),
        );

        let content = fields.content.as_deref().map(map_content).unwrap_or_default();

        let state = self.calls.entry(id.clone()).or_insert_with(|| CallState {
            name: fields.title.clone().unwrap_or_else(|| id.clone()),
            paths: Vec::new(),
            mutating: false,
            status: ToolCallStatus::Pending,
        });
        if let Some(title) = &fields.title {
            state.name = title.clone();
        }
        for path in &paths {
            push_unique(&mut state.paths, path.clone());
        }
        if fields
            .content
            .as_ref()
            .is_some_and(|blocks| has_diff(blocks))
            || is_mutating_kind(resolve_kind(fields.kind, &state.name))
            || matches_mutating(&self.mutating, &state.name)
        {
            state.mutating = true;
        }
        let status = fields.status.map(map_status).unwrap_or(state.status);
        state.status = status;

        // Summary taken by reference before `content` moves into the update
        // event — a long-running execute tool re-sends its whole accumulated
        // output per update, and cloning it per event is quadratic.
        let result_summary = matches!(status, ToolCallStatus::Completed | ToolCallStatus::Failed)
            .then(|| first_text(&content).map(|text| summarize_chars(text, SUMMARY_LIMIT)))
            .flatten();

        // summarize_json serializes only as far as the cap, so a refined input
        // carrying a whole file body is not rendered in full once per update.
        let input_summary = fields
            .raw_input
            .as_ref()
            .map(|input| summarize_json(input, SUMMARY_LIMIT));

        let mut events = vec![AgentEvent::ToolUpdate {
            id: id.clone(),
            status,
            content,
            paths,
            input_summary,
            name: fields.title.clone(),
        }];

        if matches!(status, ToolCallStatus::Completed | ToolCallStatus::Failed) {
            let state = self.calls.remove(&id).expect("state inserted above");
            events.push(AgentEvent::ToolEnd {
                id,
                name: state.name,
                ok: status == ToolCallStatus::Completed,
                result_summary,
                paths: state.paths,
                mutating: state.mutating,
            });
        }

        events
    }
}

pub(crate) fn resolve_kind(kind: Option<AcpToolKind>, name: &str) -> ToolKind {
    match kind {
        Some(AcpToolKind::Read) => ToolKind::Read,
        Some(AcpToolKind::Edit) => ToolKind::Edit,
        Some(AcpToolKind::Delete) => ToolKind::Delete,
        Some(AcpToolKind::Move) => ToolKind::Move,
        Some(AcpToolKind::Search) => ToolKind::Search,
        Some(AcpToolKind::Execute) => ToolKind::Execute,
        Some(AcpToolKind::Think) => ToolKind::Think,
        Some(AcpToolKind::Fetch) => ToolKind::Fetch,
        Some(AcpToolKind::SwitchMode) => ToolKind::SwitchMode,
        // `Other` is ACP's deserialize fallback for unknown kinds, so it carries
        // no more information than an absent kind does.
        _ => infer_tool_kind(name),
    }
}

fn map_status(status: AcpToolCallStatus) -> ToolCallStatus {
    match status {
        AcpToolCallStatus::Pending => ToolCallStatus::Pending,
        AcpToolCallStatus::InProgress => ToolCallStatus::InProgress,
        AcpToolCallStatus::Completed => ToolCallStatus::Completed,
        AcpToolCallStatus::Failed => ToolCallStatus::Failed,
        _ => ToolCallStatus::InProgress,
    }
}

fn map_location(location: &ToolCallLocation) -> ToolLocation {
    ToolLocation {
        path: location.path.to_string_lossy().into_owned(),
        line: location.line,
    }
}

fn map_content(blocks: &[ToolCallContent]) -> Vec<ToolContent> {
    blocks
        .iter()
        .filter_map(|block| match block {
            ToolCallContent::Content(content) => {
                block_text(&content.content).map(|text| ToolContent::Text { text })
            }
            ToolCallContent::Diff(diff) => Some(ToolContent::Diff {
                path: diff.path.to_string_lossy().into_owned(),
                old_text: diff.old_text.clone(),
                new_text: diff.new_text.clone(),
            }),
            _ => None,
        })
        .collect()
}

fn block_text(block: &ContentBlock) -> Option<String> {
    match block {
        ContentBlock::Text(text) => Some(text.text.clone()),
        _ => None,
    }
}

fn first_text(content: &[ToolContent]) -> Option<&str> {
    content.iter().find_map(|item| match item {
        ToolContent::Text { text } => Some(text.as_str()),
        ToolContent::Diff { .. } => None,
    })
}

fn has_diff(blocks: &[ToolCallContent]) -> bool {
    blocks
        .iter()
        .any(|block| matches!(block, ToolCallContent::Diff(_)))
}

/// `MutatingToolSet` keys MCP tools by their prefixed wire name and built-ins by
/// their bare name, so a title of either shape has to be probed both ways.
fn matches_mutating(set: &MutatingToolSet, name: &str) -> bool {
    set.contains(name) || set.contains(strip_mcp_prefix(name))
}

fn is_mutating_kind(kind: ToolKind) -> bool {
    matches!(kind, ToolKind::Edit | ToolKind::Delete | ToolKind::Move)
}

fn collect_paths(
    locations: Option<&[ToolCallLocation]>,
    blocks: Option<&[ToolCallContent]>,
    raw_input: Option<&serde_json::Value>,
) -> Vec<String> {
    let mut out = Vec::new();
    for location in locations.unwrap_or_default() {
        push_unique(&mut out, location.path.to_string_lossy().into_owned());
    }
    for block in blocks.unwrap_or_default() {
        if let ToolCallContent::Diff(diff) = block {
            push_unique(&mut out, diff.path.to_string_lossy().into_owned());
        }
    }
    if let Some(input) = raw_input {
        for path in extract_tool_paths(input) {
            push_unique(&mut out, path);
        }
    }
    out
}
