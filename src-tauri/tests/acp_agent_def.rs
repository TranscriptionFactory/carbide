use agent_client_protocol::schema::v1::SessionMode;
use serde_json::json;

use crate::features::ai::acp::agent_def::{
    node_version_rejection, preflight_error, preset_requires_node,
};
use crate::features::ai::acp::{
    pick_session_mode, resolve_acp_launch, AcpAgentSpec, AcpPresetId,
};
use crate::features::pipeline::service as pipeline;

fn missing_probe(error: Option<&str>) -> pipeline::CliProbe {
    pipeline::CliProbe {
        status: pipeline::CliProbeStatus::Missing,
        resolved_path: None,
        version: None,
        error: error.map(str::to_string),
    }
}

/// The preflight resolves against a real PATH, so these tests only run where
/// `npx` and `sh` actually exist.
fn present(command: &str) -> bool {
    pipeline::resolve_cli_with_path(command, &pipeline::get_expanded_path()).status
        == pipeline::CliProbeStatus::Present
}

fn modes(entries: &[(&str, &str)]) -> Vec<SessionMode> {
    entries
        .iter()
        .map(|(id, name)| {
            serde_json::from_value(json!({ "id": id, "name": name }))
                .expect("fixture should deserialize as a SessionMode")
        })
        .collect()
}

#[test]
fn preset_claude_resolves_to_an_npx_invocation() {
    if !present("npx") {
        return;
    }
    let launch = resolve_acp_launch(
        &AcpAgentSpec::Preset {
            id: AcpPresetId::Claude,
        },
        &pipeline::get_expanded_path(),
    )
    .expect("npx is present");

    assert!(launch.command.ends_with("npx"));
    assert_eq!(
        launch.args,
        ["-y", "@agentclientprotocol/claude-agent-acp@0.66.0"]
    );
}

#[test]
fn preset_codex_resolves_to_an_npx_invocation() {
    if !present("npx") {
        return;
    }
    let launch = resolve_acp_launch(
        &AcpAgentSpec::Preset {
            id: AcpPresetId::Codex,
        },
        &pipeline::get_expanded_path(),
    )
    .expect("npx is present");

    assert!(launch.command.ends_with("npx"));
    assert_eq!(launch.args, ["-y", "@agentclientprotocol/codex-acp@1.1.14"]);
}

/// opencode implements ACP itself, so the preset must not route through the npx
/// adapter shim the other two need.
#[test]
fn preset_opencode_launches_the_agents_own_acp_subcommand() {
    if !present("opencode") {
        return;
    }
    let launch = resolve_acp_launch(
        &AcpAgentSpec::Preset {
            id: AcpPresetId::Opencode,
        },
        &pipeline::get_expanded_path(),
    )
    .expect("opencode is present");

    assert!(launch.command.ends_with("opencode"));
    assert_eq!(launch.args, ["acp"]);
}

#[test]
fn a_missing_opencode_names_the_agent_not_node() {
    let error = preflight_error(
        &AcpAgentSpec::Preset {
            id: AcpPresetId::Opencode,
        },
        "opencode",
        &missing_probe(None),
    );

    assert!(error.contains("opencode"));
    assert!(!error.contains("Node.js"));
}

/// pi has no ACP mode of its own, so the preset goes through the community
/// adapter rather than the `pi` binary.
#[test]
fn preset_pi_resolves_to_the_adapter_package() {
    if !present("npx") {
        return;
    }
    let launch = resolve_acp_launch(
        &AcpAgentSpec::Preset { id: AcpPresetId::Pi },
        &pipeline::get_expanded_path(),
    )
    .expect("npx is present");

    assert!(launch.command.ends_with("npx"));
    assert_eq!(launch.args, ["-y", "pi-acp@0.0.33"]);
}

#[test]
fn preset_agent_ids_are_distinct_per_preset() {
    let id = |preset| AcpAgentSpec::Preset { id: preset }.agent_id();

    assert_eq!(id(AcpPresetId::Claude), "claude");
    assert_eq!(id(AcpPresetId::Codex), "codex");
    assert_eq!(id(AcpPresetId::Opencode), "opencode");
    assert_eq!(id(AcpPresetId::Pi), "pi");
}

#[test]
fn custom_args_pass_through_verbatim() {
    if !present("sh") {
        return;
    }
    let launch = resolve_acp_launch(
        &AcpAgentSpec::Custom {
            command: "sh".to_string(),
            args: vec!["-c".to_string(), "my-agent --acp".to_string()],
        },
        &pipeline::get_expanded_path(),
    )
    .expect("sh is present");

    assert!(launch.command.ends_with("sh"));
    assert_eq!(launch.args, ["-c", "my-agent --acp"]);
}

#[test]
fn a_missing_custom_command_reports_an_actionable_error() {
    let error = resolve_acp_launch(
        &AcpAgentSpec::Custom {
            command: "carbide-no-such-agent-binary".to_string(),
            args: Vec::new(),
        },
        "/nonexistent",
    )
    .expect_err("the command does not exist");

    assert!(error.contains("carbide-no-such-agent-binary"));
    assert!(error.contains("not found"));
}

#[test]
fn a_missing_npx_points_at_node() {
    let error = preflight_error(
        &AcpAgentSpec::Preset {
            id: AcpPresetId::Claude,
        },
        "npx",
        &missing_probe(None),
    );

    assert!(error.contains("npx"));
    assert!(error.contains("Node.js"));
    assert!(error.contains("install"));
}

#[test]
fn an_unverifiable_command_is_reported_as_unverified_not_missing() {
    let error = preflight_error(
        &AcpAgentSpec::Custom {
            command: "my-agent".to_string(),
            args: Vec::new(),
        },
        "my-agent",
        &pipeline::CliProbe {
            status: pipeline::CliProbeStatus::Unknown,
            resolved_path: None,
            version: None,
            error: None,
        },
    );

    assert!(error.contains("my-agent"));
    assert!(error.contains("Could not verify"));
}

#[test]
fn a_present_but_unexecutable_command_reports_the_probe_detail() {
    let error = preflight_error(
        &AcpAgentSpec::Custom {
            command: "/opt/my-agent".to_string(),
            args: Vec::new(),
        },
        "/opt/my-agent",
        &missing_probe(Some("/opt/my-agent found but not executable")),
    );

    assert!(error.contains("found but not executable"));
}

#[test]
fn an_empty_custom_command_is_rejected() {
    let error = resolve_acp_launch(
        &AcpAgentSpec::Custom {
            command: "   ".to_string(),
            args: Vec::new(),
        },
        "/nonexistent",
    )
    .expect_err("a blank command is not runnable");

    assert!(error.contains("No command configured"));
}

/// The npx-shimmed presets run on Node; an agent that speaks ACP itself does
/// not, and must never be blocked by a runtime it never touches.
#[test]
fn only_the_npx_shimmed_presets_are_node_gated() {
    for preset in [AcpPresetId::Claude, AcpPresetId::Codex, AcpPresetId::Pi] {
        assert!(preset_requires_node(preset), "{preset:?}");
    }
    assert!(!preset_requires_node(AcpPresetId::Opencode));
}

#[test]
fn a_too_old_node_names_the_version_the_minimum_and_the_path() {
    let error = node_version_rejection("18.20.4", "/opt/old/bin/node")
        .expect("Node 18 is below the minimum");

    assert!(error.contains("18.20.4"));
    assert!(error.contains("20"));
    assert!(error.contains("/opt/old/bin/node"));
}

#[test]
fn a_supported_node_is_not_rejected() {
    assert_eq!(node_version_rejection("20.0.0", "/usr/bin/node"), None);
    assert_eq!(node_version_rejection("22.11.0", "/usr/bin/node"), None);
}

/// `npx` already resolved, so a runtime exists — refusing to launch on a
/// version string we could not parse would trade a rare hang for a common
/// false negative.
#[test]
fn an_unparseable_node_version_is_never_a_launch_blocker() {
    assert_eq!(node_version_rejection("", "/usr/bin/node"), None);
    assert_eq!(node_version_rejection("nightly", "/usr/bin/node"), None);
}

#[test]
fn accept_edits_style_modes_are_preferred() {
    let picked = pick_session_mode(&modes(&[
        ("default", "Ask every time"),
        ("acceptEdits", "Accept edits"),
    ]));

    assert_eq!(picked.as_deref(), Some("acceptEdits"));
}

#[test]
fn auto_named_modes_are_preferred() {
    let picked = pick_session_mode(&modes(&[("normal", "Normal"), ("auto", "Auto approve")]));

    assert_eq!(picked.as_deref(), Some("auto"));
}

#[test]
fn a_bypass_mode_is_never_picked_even_when_it_is_the_only_candidate() {
    for entry in [
        ("bypassPermissions", "Accept edits"),
        ("full-auto", "YOLO mode"),
        ("auto-danger", "Auto accept everything"),
    ] {
        assert_eq!(pick_session_mode(&modes(&[entry])), None, "picked {entry:?}");
    }
}

#[test]
fn no_acceptable_mode_yields_none() {
    assert_eq!(pick_session_mode(&modes(&[("default", "Ask")])), None);
    assert_eq!(pick_session_mode(&[]), None);
}

#[test]
fn agent_spec_round_trips_through_json() {
    let preset: AcpAgentSpec =
        serde_json::from_value(json!({ "kind": "preset", "id": "claude" })).expect("preset");
    assert_eq!(
        preset,
        AcpAgentSpec::Preset {
            id: AcpPresetId::Claude
        }
    );
    assert_eq!(
        serde_json::to_value(&preset).expect("serialize"),
        json!({ "kind": "preset", "id": "claude" })
    );

    let custom: AcpAgentSpec = serde_json::from_value(
        json!({ "kind": "custom", "command": "my-agent", "args": ["--acp"] }),
    )
    .expect("custom");
    assert_eq!(
        custom,
        AcpAgentSpec::Custom {
            command: "my-agent".to_string(),
            args: vec!["--acp".to_string()]
        }
    );
    assert_eq!(
        serde_json::to_value(&custom).expect("serialize"),
        json!({ "kind": "custom", "command": "my-agent", "args": ["--acp"] })
    );

    let codex: AcpAgentSpec =
        serde_json::from_value(json!({ "kind": "preset", "id": "codex" })).expect("codex");
    assert_eq!(
        codex,
        AcpAgentSpec::Preset {
            id: AcpPresetId::Codex
        }
    );

    let opencode: AcpAgentSpec =
        serde_json::from_value(json!({ "kind": "preset", "id": "opencode" })).expect("opencode");
    assert_eq!(
        opencode,
        AcpAgentSpec::Preset {
            id: AcpPresetId::Opencode
        }
    );

    let pi: AcpAgentSpec =
        serde_json::from_value(json!({ "kind": "preset", "id": "pi" })).expect("pi");
    assert_eq!(pi, AcpAgentSpec::Preset { id: AcpPresetId::Pi });
}
