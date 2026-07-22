use crate::features::ai::agent_handoff::{
    build_handoff_command, linux_terminal_launch, pick_linux_terminal, shell_join,
};

#[test]
fn handoff_command_has_interactive_mcp_flags() {
    let cmd = build_handoff_command("/usr/bin/claude", "/home/u/.carbide/agent-mcp-config.json");
    assert_eq!(
        cmd,
        vec![
            "/usr/bin/claude",
            "--mcp-config",
            "/home/u/.carbide/agent-mcp-config.json",
            "--strict-mcp-config",
        ]
    );
    assert!(!cmd.contains(&"-p".to_string()));
}

#[test]
fn env_terminal_wins_over_detection() {
    let picked = pick_linux_terminal(Some("wezterm"), |_| false);
    assert_eq!(picked, Some("wezterm".to_string()));
}

#[test]
fn blank_env_terminal_falls_back_to_detection() {
    let picked = pick_linux_terminal(Some("  "), |t| t == "kitty");
    assert_eq!(picked, Some("kitty".to_string()));
}

#[test]
fn detection_respects_list_order() {
    let picked = pick_linux_terminal(None, |t| t == "konsole" || t == "xterm");
    assert_eq!(picked, Some("konsole".to_string()));
}

#[test]
fn no_terminal_available_returns_none() {
    assert_eq!(pick_linux_terminal(None, |_| false), None);
}

#[test]
fn gnome_terminal_uses_working_directory_flag() {
    let cmd = vec!["claude".to_string(), "--strict-mcp-config".to_string()];
    let launch = linux_terminal_launch("gnome-terminal", "/vault", &cmd);
    assert_eq!(launch.program, "gnome-terminal");
    assert_eq!(
        launch.args,
        vec!["--working-directory=/vault", "--", "claude", "--strict-mcp-config"]
    );
}

#[test]
fn konsole_uses_workdir_and_dash_e() {
    let cmd = vec!["claude".to_string()];
    let launch = linux_terminal_launch("konsole", "/vault", &cmd);
    assert_eq!(launch.args, vec!["--workdir", "/vault", "-e", "claude"]);
}

#[test]
fn kitty_uses_directory_flag_without_dash_e() {
    let cmd = vec!["claude".to_string()];
    let launch = linux_terminal_launch("kitty", "/vault", &cmd);
    assert_eq!(launch.args, vec!["--directory", "/vault", "claude"]);
}

#[test]
fn unknown_terminal_falls_back_to_dash_e() {
    let cmd = vec!["claude".to_string()];
    let launch = linux_terminal_launch("/opt/bin/st", "/vault", &cmd);
    assert_eq!(launch.program, "/opt/bin/st");
    assert_eq!(launch.args, vec!["-e", "claude"]);
}

#[test]
fn absolute_terminal_path_matches_on_basename() {
    let cmd = vec!["claude".to_string()];
    let launch = linux_terminal_launch("/usr/bin/alacritty", "/vault", &cmd);
    assert_eq!(
        launch.args,
        vec!["--working-directory", "/vault", "-e", "claude"]
    );
}

#[test]
fn shell_join_quotes_and_escapes() {
    let cmd = vec!["claude".to_string(), "it's".to_string()];
    assert_eq!(shell_join(&cmd), "'claude' 'it'\\''s'");
}
