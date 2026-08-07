use agent_client_protocol::schema::v1::{
    PermissionOption, PermissionOptionKind as AcpPermissionOptionKind, RequestPermissionRequest,
};

use crate::features::ai::agent_stream::{
    PermissionOptionKind, PermissionOptionSpec, ToolKind,
};
use crate::features::ai::tool_paths::extract_tool_paths;

use super::permissions::PermissionRequestSpec;
use super::translate::resolve_kind;

// Pure ACP-request → engine-spec mapping. The decision itself lives in
// PermissionEngine; this module only translates wire shapes.

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
        name,
        kind,
        input_summary: fields
            .raw_input
            .as_ref()
            .map(|input| crate::features::ai::agent_stream::summarize_chars(&input.to_string(), 200))
            .unwrap_or_default(),
        paths,
        mutating,
        options: request.options.iter().map(map_option).collect(),
    }
}

pub fn map_option_kind(kind: AcpPermissionOptionKind) -> PermissionOptionKind {
    match kind {
        AcpPermissionOptionKind::AllowOnce => PermissionOptionKind::AllowOnce,
        AcpPermissionOptionKind::AllowAlways => PermissionOptionKind::AllowAlways,
        AcpPermissionOptionKind::RejectOnce => PermissionOptionKind::RejectOnce,
        // The wire enum is non-exhaustive; a refusal is the safe reading of an
        // unknown kind.
        _ => PermissionOptionKind::RejectAlways,
    }
}

fn map_option(option: &PermissionOption) -> PermissionOptionSpec {
    PermissionOptionSpec {
        option_id: option.option_id.to_string(),
        label: option.name.clone(),
        kind: map_option_kind(option.kind),
    }
}

pub fn option_kind_name(kind: PermissionOptionKind) -> &'static str {
    match kind {
        PermissionOptionKind::AllowOnce => "allow_once",
        PermissionOptionKind::AllowAlways => "allow_always",
        PermissionOptionKind::RejectOnce => "reject_once",
        PermissionOptionKind::RejectAlways => "reject_always",
    }
}

/// The option to answer with for an auto decision: allow prefers the mildest
/// grant, refusal prefers the mildest rejection.
pub fn select_option(
    options: &[PermissionOptionSpec],
    allow: bool,
) -> Option<&PermissionOptionSpec> {
    let order: &[PermissionOptionKind] = if allow {
        &[
            PermissionOptionKind::AllowOnce,
            PermissionOptionKind::AllowAlways,
        ]
    } else {
        &[
            PermissionOptionKind::RejectOnce,
            PermissionOptionKind::RejectAlways,
        ]
    };
    order
        .iter()
        .find_map(|kind| options.iter().find(|option| option.kind == *kind))
}
