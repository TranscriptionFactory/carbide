use agent_client_protocol::schema::v1::SessionMode;
use serde_json::json;

use crate::features::ai::acp::agent_def::preflight_error;
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
    assert_eq!(launch.args, ["-y", "@agentclientprotocol/claude-agent-acp"]);
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
    assert_eq!(launch.args, ["-y", "@agentclientprotocol/codex-acp"]);
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
}
