use agent_client_protocol::schema::v1::{
    PermissionOption, PermissionOptionKind as AcpPermissionOptionKind, RequestPermissionRequest,
};

use crate::features::ai::agent_stream::{
    summarize_json, PermissionOptionKind, PermissionOptionSpec, ToolKind,
};
use crate::features::ai::harness::MCP_TOOL_PREFIX;
use crate::features::ai::tool_paths::extract_tool_paths;

use super::permissions::PermissionRequestSpec;
use super::translate::resolve_kind;

// Pure ACP-request → engine-spec mapping. The decision itself lives in
// PermissionEngine; this module only translates wire shapes.

const INPUT_SUMMARY_CHARS: usize = 200;

pub fn build_request_spec(
    agent_id: &str,
    request: &RequestPermissionRequest,
) -> PermissionRequestSpec {
    let tool_call_id = request.tool_call.tool_call_id.to_string();
    let fields = &request.tool_call.fields;
    let name = fields
        .title
        .clone()
        .unwrap_or_else(|| tool_call_id.clone());
    let kind = resolve_kind(fields.kind, &name);
    let paths = fields
        .raw_input
        .as_ref()
        .map(extract_tool_paths)
        .unwrap_or_default();
    let mutating = matches!(kind, ToolKind::Edit | ToolKind::Delete | ToolKind::Move);

    PermissionRequestSpec {
        agent_id: agent_id.to_string(),
        tool_call_id: Some(tool_call_id),
        name: name.clone(),
        kind,
        input_summary: fields
            .raw_input
            .as_ref()
            .map(|input| summarize_json(input, INPUT_SUMMARY_CHARS))
            .unwrap_or_default(),
        paths,
        // Carbide's own MCP tools are already gated by the scoped token the
        // dispatch layer checks — the naming convention is a wire fact, so it
        // is read here rather than inside the engine.
        pre_authorized: name.starts_with(MCP_TOOL_PREFIX),
        mutating,
        options: request.options.iter().filter_map(map_option).collect(),
    }
}

fn map_option_kind(kind: AcpPermissionOptionKind) -> Option<PermissionOptionKind> {
    match kind {
        AcpPermissionOptionKind::AllowOnce => Some(PermissionOptionKind::AllowOnce),
        AcpPermissionOptionKind::AllowAlways => Some(PermissionOptionKind::AllowAlways),
        AcpPermissionOptionKind::RejectOnce => Some(PermissionOptionKind::RejectOnce),
        AcpPermissionOptionKind::RejectAlways => Some(PermissionOptionKind::RejectAlways),
        // The wire enum is non-exhaustive. An option we cannot name is one we
        // cannot label honestly, so it is dropped rather than guessed at.
        _ => None,
    }
}

fn map_option(option: &PermissionOption) -> Option<PermissionOptionSpec> {
    Some(PermissionOptionSpec {
        option_id: option.option_id.to_string(),
        label: option.name.clone(),
        kind: map_option_kind(option.kind)?,
    })
}

/// The option to answer an auto-allow with: the mildest grant on offer.
pub fn select_allow(options: &[PermissionOptionSpec]) -> Option<&PermissionOptionSpec> {
    [
        PermissionOptionKind::AllowOnce,
        PermissionOptionKind::AllowAlways,
    ]
    .iter()
    .find_map(|kind| options.iter().find(|option| option.kind == *kind))
}
