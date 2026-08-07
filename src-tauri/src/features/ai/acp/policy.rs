use agent_client_protocol::schema::v1::{
    PermissionOption, PermissionOptionKind as AcpPermissionOptionKind, RequestPermissionRequest,
};

use crate::features::ai::agent_stream::{AgentEvent, ToolKind, ToolSelector};
use crate::features::ai::harness::MCP_TOOL_PREFIX;

use super::translate::resolve_kind;

/// Outcome of answering a `session/request_permission` without the user.
///
/// A `selected_option_id` of `None` means no acceptable option was offered and
/// the caller must cancel the turn instead of responding with a selection.
pub struct AutoDecision {
    pub selected_option_id: Option<String>,
    pub resolved: AgentEvent,
}

pub fn auto_decide(toolset: &ToolSelector, request: &RequestPermissionRequest) -> AutoDecision {
    let request_id = request.tool_call.tool_call_id.to_string();
    let name = request
        .tool_call
        .fields
        .title
        .clone()
        .unwrap_or_else(|| request_id.clone());
    let kind = resolve_kind(request.tool_call.fields.kind, &name);

    let selected = if permits(toolset, kind, &name) {
        pick(&request.options, AcpPermissionOptionKind::AllowOnce)
            .or_else(|| pick(&request.options, AcpPermissionOptionKind::AllowAlways))
    } else {
        pick(&request.options, AcpPermissionOptionKind::RejectOnce)
    };

    let outcome = match &selected {
        Some(option) => format!("selected:{}", option_kind_name(option.kind)),
        None => "cancelled".to_string(),
    };

    AutoDecision {
        selected_option_id: selected.map(|option| option.option_id.to_string()),
        resolved: AgentEvent::PermissionResolved {
            request_id,
            outcome,
            auto: true,
        },
    }
}

fn permits(toolset: &ToolSelector, kind: ToolKind, name: &str) -> bool {
    match toolset {
        ToolSelector::Full => true,
        ToolSelector::ReadOnly | ToolSelector::Only { .. } => {
            is_read_only_kind(kind) || permits_mcp_tool(toolset, name)
        }
    }
}

/// Whether the selector names this carbide MCP tool explicitly. `ReadOnly`
/// answers `false`: its allow-list is derived from the tool catalog's `mutating`
/// flags, which this pure decision does not carry, so the kind check above is
/// the only gate it can honour.
fn permits_mcp_tool(toolset: &ToolSelector, name: &str) -> bool {
    let Some(base) = name.strip_prefix(MCP_TOOL_PREFIX) else {
        return false;
    };
    match toolset {
        ToolSelector::Full => true,
        ToolSelector::ReadOnly => false,
        ToolSelector::Only { names } => names.iter().any(|allowed| allowed == base),
    }
}

fn is_read_only_kind(kind: ToolKind) -> bool {
    matches!(
        kind,
        ToolKind::Read | ToolKind::Search | ToolKind::Think | ToolKind::Fetch
    )
}

fn pick(options: &[PermissionOption], kind: AcpPermissionOptionKind) -> Option<&PermissionOption> {
    options.iter().find(|option| option.kind == kind)
}

fn option_kind_name(kind: AcpPermissionOptionKind) -> &'static str {
    match kind {
        AcpPermissionOptionKind::AllowOnce => "allow_once",
        AcpPermissionOptionKind::AllowAlways => "allow_always",
        AcpPermissionOptionKind::RejectOnce => "reject_once",
        AcpPermissionOptionKind::RejectAlways => "reject_always",
        _ => "unknown",
    }
}
