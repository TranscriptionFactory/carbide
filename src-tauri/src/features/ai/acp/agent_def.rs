use serde::{Deserialize, Serialize};
use specta::Type;

use crate::features::ai::agent_stream::cli_probe_error_message;
use crate::features::pipeline::service as pipeline;

/// Adapter versions are pinned rather than left to resolve `latest` on every
/// cold launch: these packages execute with the ACP agent's full system access,
/// so an upstream release must not reach users untested, and a bug report needs
/// a version to cite. See `docs/ai_and_chat.md` for the bump procedure.
const CLAUDE_ACP_PACKAGE: &str = "@agentclientprotocol/claude-agent-acp";
const CLAUDE_ACP_VERSION: &str = "0.66.0";
const CODEX_ACP_PACKAGE: &str = "@agentclientprotocol/codex-acp";
const CODEX_ACP_VERSION: &str = "1.1.14";
/// Community adapter — pi speaks its own `--mode rpc` dialect, not ACP.
const PI_ACP_PACKAGE: &str = "pi-acp";
const PI_ACP_VERSION: &str = "0.0.33";
const NPX: &str = "npx";

/// The adapters are published as ESM against a modern Node. On an older runtime
/// `npx` still resolves — so the preflight passes — and the adapter then dies
/// mid-`initialize`, which reaches the user as a closed channel and nothing
/// else. Checking the version here turns that silent hang into a sentence.
const MIN_NODE_MAJOR: u32 = 20;

/// An npx-shimmed preset never runs the user's own command, so the error has to
/// name what they are actually missing rather than the shim they never
/// configured. An agent that speaks ACP itself names the agent instead.
const NPX_DISPLAY_NAME: &str = "npx (Node.js)";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum AcpPresetId {
    Claude,
    Codex,
    Opencode,
    Pi,
}

impl AcpPresetId {
    fn as_str(self) -> &'static str {
        match self {
            AcpPresetId::Claude => "claude",
            AcpPresetId::Codex => "codex",
            AcpPresetId::Opencode => "opencode",
            AcpPresetId::Pi => "pi",
        }
    }
}

/// What a preset actually spawns. Not every agent needs the npx adapter — one
/// that implements ACP itself is launched directly, and then the preflight has
/// to report the agent as missing rather than Node.
struct PresetLaunch {
    command: &'static str,
    args: Vec<String>,
    display_name: &'static str,
    /// Only the npx-shimmed presets run on Node. An agent that speaks ACP
    /// itself must never be blocked by a Node it does not use.
    requires_node: bool,
}

fn npx_adapter(package: &'static str, version: &'static str) -> PresetLaunch {
    PresetLaunch {
        command: NPX,
        args: vec!["-y".to_string(), format!("{package}@{version}")],
        display_name: NPX_DISPLAY_NAME,
        requires_node: true,
    }
}

/// The launch shape itself stays private — this exposes only the one bit the
/// Node-gating test needs to pin.
#[cfg(test)]
pub(crate) fn preset_requires_node(id: AcpPresetId) -> bool {
    preset_launch(id).requires_node
}

fn preset_launch(id: AcpPresetId) -> PresetLaunch {
    match id {
        AcpPresetId::Claude => npx_adapter(CLAUDE_ACP_PACKAGE, CLAUDE_ACP_VERSION),
        AcpPresetId::Codex => npx_adapter(CODEX_ACP_PACKAGE, CODEX_ACP_VERSION),
        AcpPresetId::Opencode => PresetLaunch {
            command: "opencode",
            args: vec!["acp".to_string()],
            display_name: "opencode",
            requires_node: false,
        },
        AcpPresetId::Pi => npx_adapter(PI_ACP_PACKAGE, PI_ACP_VERSION),
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AcpAgentSpec {
    Preset {
        id: AcpPresetId,
    },
    Custom {
        command: String,
        #[serde(default)]
        args: Vec<String>,
    },
}

impl AcpAgentSpec {
    /// Stable identity for permission grants: the preset name, or the custom
    /// command verbatim.
    pub fn agent_id(&self) -> String {
        match self {
            AcpAgentSpec::Preset { id } => id.as_str().to_string(),
            AcpAgentSpec::Custom { command, .. } => command.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AcpLaunch {
    pub command: String,
    pub args: Vec<String>,
}

pub fn resolve_acp_launch(spec: &AcpAgentSpec, path_env: &str) -> Result<AcpLaunch, String> {
    // A custom spec is the user's own command; only the presets we shim through
    // npx are ours to gate on a runtime.
    let (command, args, requires_node) = match spec {
        AcpAgentSpec::Preset { id } => {
            let launch = preset_launch(*id);
            (
                launch.command.to_string(),
                launch.args,
                launch.requires_node,
            )
        }
        AcpAgentSpec::Custom { command, args } => {
            let command = command.trim().to_string();
            if command.is_empty() {
                return Err("No command configured for the custom ACP agent".to_string());
            }
            (command, args.clone(), false)
        }
    };

    let probe = pipeline::resolve_cli_with_path(&command, path_env);
    if probe.status != pipeline::CliProbeStatus::Present {
        return Err(preflight_error(spec, &command, &probe));
    }

    // An absolute path removes the dependency on how the child process inherits
    // PATH, which differs between the launcher shims (nvm, fnm, mise) that
    // usually provide `npx`.
    let command = probe.resolved_path.unwrap_or(command);

    if requires_node {
        if let Some(error) = node_runtime_error(&command, path_env) {
            return Err(error);
        }
    }

    Ok(AcpLaunch { command, args })
}

/// `Some` only when Node was found *and* read *and* is too old. An unreadable
/// version is never a launch blocker: `npx` already resolved, so a runtime
/// exists, and refusing to start on a failed `node --version` would trade a
/// rare hang for a common false negative.
fn node_runtime_error(resolved_npx: &str, path_env: &str) -> Option<String> {
    let node = pipeline::node_runtime_for_shim(resolved_npx, path_env)?;
    node_version_rejection(&node.version, &node.path)
}

/// Split from the probe so the rule is testable without a Node install. The
/// minimum is a major-version floor, so comparing majors is a complete check —
/// no semver parser earns its keep here.
pub(crate) fn node_version_rejection(version: &str, node_path: &str) -> Option<String> {
    let major: u32 = version.split('.').next()?.parse().ok()?;
    if major >= MIN_NODE_MAJOR {
        return None;
    }
    Some(format!(
        "Node.js {version} is too old to run the ACP adapter — Carbide needs Node.js {MIN_NODE_MAJOR} or newer (found {node_path}). Upgrade Node.js, or pick the opencode preset, which needs no Node."
    ))
}

/// Separate from the preflight itself because a bare command name falls back to
/// a login-shell lookup, so the not-found branch cannot be reached on a machine
/// where the tool happens to be installed.
pub(crate) fn preflight_error(
    spec: &AcpAgentSpec,
    command: &str,
    probe: &pipeline::CliProbe,
) -> String {
    let provider_name = match spec {
        AcpAgentSpec::Preset { id } => preset_launch(*id).display_name,
        AcpAgentSpec::Custom { .. } => command,
    };
    cli_probe_error_message(provider_name, probe)
}
