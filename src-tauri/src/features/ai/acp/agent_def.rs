use agent_client_protocol::schema::v1::SessionMode;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::features::ai::agent_stream::cli_probe_error_message;
use crate::features::pipeline::service as pipeline;

const CLAUDE_ACP_PACKAGE: &str = "@agentclientprotocol/claude-agent-acp";
const CODEX_ACP_PACKAGE: &str = "@agentclientprotocol/codex-acp";
const NPX: &str = "npx";

/// Presets never run the user's own command, so the error has to name what they
/// are actually missing rather than the `npx` shim they never configured.
const NPX_DISPLAY_NAME: &str = "npx (Node.js)";

/// Session modes whose id or name matches any of these are never selected, even
/// when the agent advertises nothing else: they disable the agent's own
/// confirmation prompts, which is the one guarantee Carbide cannot give back.
const FORBIDDEN_MODE_MARKERS: [&str; 3] = ["bypass", "yolo", "danger"];

const PREFERRED_MODE_MARKERS: [&str; 2] = ["accept", "auto"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum AcpPresetId {
    Claude,
    Codex,
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
            AcpAgentSpec::Preset { id: AcpPresetId::Claude } => "claude".to_string(),
            AcpAgentSpec::Preset { id: AcpPresetId::Codex } => "codex".to_string(),
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
    let (command, args) = match spec {
        AcpAgentSpec::Preset { id } => {
            let package = match id {
                AcpPresetId::Claude => CLAUDE_ACP_PACKAGE,
                AcpPresetId::Codex => CODEX_ACP_PACKAGE,
            };
            (
                NPX.to_string(),
                vec!["-y".to_string(), package.to_string()],
            )
        }
        AcpAgentSpec::Custom { command, args } => {
            let command = command.trim().to_string();
            if command.is_empty() {
                return Err("No command configured for the custom ACP agent".to_string());
            }
            (command, args.clone())
        }
    };

    let probe = pipeline::resolve_cli_with_path(&command, path_env);
    if probe.status != pipeline::CliProbeStatus::Present {
        return Err(preflight_error(spec, &command, &probe));
    }

    Ok(AcpLaunch {
        // An absolute path removes the dependency on how the child process
        // inherits PATH, which differs between the launcher shims (nvm, fnm,
        // mise) that usually provide `npx`.
        command: probe.resolved_path.unwrap_or(command),
        args,
    })
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
        AcpAgentSpec::Preset { .. } => NPX_DISPLAY_NAME,
        AcpAgentSpec::Custom { .. } => command,
    };
    cli_probe_error_message(provider_name, probe)
}

/// The mode to request after `session/new` when the user asked for the power
/// intent. Returns `None` when nothing acceptable is on offer, which leaves the
/// agent in whatever mode it started in.
pub fn pick_session_mode(available_modes: &[SessionMode]) -> Option<String> {
    available_modes
        .iter()
        .filter(|mode| !is_forbidden_mode(mode))
        .find(|mode| {
            PREFERRED_MODE_MARKERS
                .iter()
                .any(|marker| mode_matches(mode, marker))
        })
        .map(|mode| mode.id.to_string())
}

fn is_forbidden_mode(mode: &SessionMode) -> bool {
    FORBIDDEN_MODE_MARKERS
        .iter()
        .any(|marker| mode_matches(mode, marker))
}

fn mode_matches(mode: &SessionMode, marker: &str) -> bool {
    mode.id.to_string().to_ascii_lowercase().contains(marker)
        || mode.name.to_ascii_lowercase().contains(marker)
}
