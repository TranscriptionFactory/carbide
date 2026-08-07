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

// Request identity is minted here, not borrowed from the tool call: an agent
// that re-asks for the same call must produce a distinct request, or Phase 3
// cannot route an answer back to the right parked responder.
fn mint_request_id() -> String {
    let mut bytes = [0u8; 8];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut bytes);
    format!("perm-{}", hex::encode(bytes))
}

pub fn auto_decide(toolset: &ToolSelector, request: &RequestPermissionRequest) -> AutoDecision {
    let tool_call_id = request.tool_call.tool_call_id.to_string();
    let name = request
        .tool_call
        .fields
        .title
        .clone()
        .unwrap_or_else(|| tool_call_id.clone());
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
            request_id: mint_request_id(),
            outcome,
            auto: true,
        },
    }
}

// `ReadOnly` has no name gate here: its allow-list is derived from the tool
// catalog's `mutating` flags, which this pure decision does not carry, so the
// kind check is the only gate it can honour.
fn permits(toolset: &ToolSelector, kind: ToolKind, name: &str) -> bool {
    match toolset {
        ToolSelector::Full => true,
        ToolSelector::ReadOnly => is_read_only_kind(kind),
        ToolSelector::Only { names } => {
            is_read_only_kind(kind)
                || name
                    .strip_prefix(MCP_TOOL_PREFIX)
                    .is_some_and(|base| names.iter().any(|allowed| allowed == base))
        }
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
