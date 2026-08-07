use std::collections::HashMap;

use agent_client_protocol::schema::v1::{
    ContentBlock, SessionUpdate, ToolCall, ToolCallContent, ToolCallLocation,
    ToolCallStatus as AcpToolCallStatus, ToolCallUpdate, ToolKind as AcpToolKind,
};

use crate::features::ai::agent_stream::{
    infer_tool_kind, AgentEvent, ToolCallStatus, ToolContent, ToolKind, ToolLocation,
};
use crate::features::ai::harness::{MutatingToolSet, MCP_TOOL_PREFIX};
use crate::features::ai::tool_paths::extract_tool_paths;

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

        let mut paths = Vec::new();
        collect_location_paths(&call.locations, &mut paths);
        collect_content_paths(&call.content, &mut paths);
        if let Some(input) = &call.raw_input {
            for path in extract_tool_paths(input) {
                push_unique(&mut paths, path);
            }
        }

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
                .map(|input| truncate(&input.to_string(), SUMMARY_LIMIT))
                .unwrap_or_default(),
            paths,
            mutating,
            locations: call.locations.iter().map(map_location).collect(),
        }
    }

    fn on_tool_call_update(&mut self, update: &ToolCallUpdate) -> Vec<AgentEvent> {
        let id = update.tool_call_id.to_string();
        let fields = &update.fields;

        let mut paths = Vec::new();
        if let Some(locations) = &fields.locations {
            collect_location_paths(locations, &mut paths);
        }
        if let Some(content) = &fields.content {
            collect_content_paths(content, &mut paths);
        }
        if let Some(input) = &fields.raw_input {
            for path in extract_tool_paths(input) {
                push_unique(&mut paths, path);
            }
        }

        let content = fields
            .content
            .as_ref()
            .map(|blocks| map_content(blocks))
            .unwrap_or_default();

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

        let mut events = vec![AgentEvent::ToolUpdate {
            id: id.clone(),
            status,
            content: content.clone(),
            paths,
        }];

        if matches!(status, ToolCallStatus::Completed | ToolCallStatus::Failed) {
            let state = self.calls.remove(&id).expect("state inserted above");
            events.push(AgentEvent::ToolEnd {
                id,
                name: state.name,
                ok: status == ToolCallStatus::Completed,
                result_summary: first_text(&content).map(|text| truncate(&text, SUMMARY_LIMIT)),
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

fn first_text(content: &[ToolContent]) -> Option<String> {
    content.iter().find_map(|item| match item {
        ToolContent::Text { text } => Some(text.clone()),
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

fn collect_location_paths(locations: &[ToolCallLocation], out: &mut Vec<String>) {
    for location in locations {
        push_unique(out, location.path.to_string_lossy().into_owned());
    }
}

fn collect_content_paths(blocks: &[ToolCallContent], out: &mut Vec<String>) {
    for block in blocks {
        if let ToolCallContent::Diff(diff) = block {
            push_unique(out, diff.path.to_string_lossy().into_owned());
        }
    }
}

fn push_unique(out: &mut Vec<String>, path: String) {
    if !path.is_empty() && !out.iter().any(|seen| seen == &path) {
        out.push(path);
    }
}

pub(crate) fn strip_mcp_prefix(name: &str) -> &str {
    name.strip_prefix(MCP_TOOL_PREFIX).unwrap_or(name)
}

pub(crate) fn truncate(text: &str, limit: usize) -> String {
    match text.char_indices().nth(limit) {
        Some((cut, _)) => text[..cut].to_string(),
        None => text.to_string(),
    }
}
