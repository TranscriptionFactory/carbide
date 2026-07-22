use std::process::{Command, Stdio};

use tauri::AppHandle;

use crate::features::pipeline::service as pipeline;

use super::agent_stream::{cli_probe_error_message, prepare_mcp_config};
use super::service::{AiProviderConfig, AiTransport};

pub const LINUX_TERMINALS: &[&str] = &[
    "x-terminal-emulator",
    "gnome-terminal",
    "konsole",
    "foot",
    "alacritty",
    "kitty",
    "xterm",
];

#[derive(Debug, PartialEq, Eq)]
pub struct TerminalLaunch {
    pub program: String,
    pub args: Vec<String>,
}

pub fn build_handoff_command(cli_command: &str, mcp_config_path: &str) -> Vec<String> {
    vec![
        cli_command.to_string(),
        "--mcp-config".to_string(),
        mcp_config_path.to_string(),
        "--strict-mcp-config".to_string(),
    ]
}

pub fn pick_linux_terminal(
    env_terminal: Option<&str>,
    is_available: impl Fn(&str) -> bool,
) -> Option<String> {
    if let Some(term) = env_terminal.map(str::trim).filter(|t| !t.is_empty()) {
        return Some(term.to_string());
    }
    LINUX_TERMINALS
        .iter()
        .find(|t| is_available(t))
        .map(|t| (*t).to_string())
}

pub fn linux_terminal_launch(
    terminal: &str,
    vault_path: &str,
    agent_cmd: &[String],
) -> TerminalLaunch {
    let base = std::path::Path::new(terminal)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| terminal.to_string());
    let mut args: Vec<String> = match base.as_str() {
        "gnome-terminal" => vec![
            format!("--working-directory={vault_path}"),
            "--".to_string(),
        ],
        "konsole" => vec![
            "--workdir".to_string(),
            vault_path.to_string(),
            "-e".to_string(),
        ],
        "foot" => vec![format!("--working-directory={vault_path}")],
        "alacritty" => vec![
            "--working-directory".to_string(),
            vault_path.to_string(),
            "-e".to_string(),
        ],
        "kitty" => vec!["--directory".to_string(), vault_path.to_string()],
        _ => vec!["-e".to_string()],
    };
    args.extend(agent_cmd.iter().cloned());
    TerminalLaunch {
        program: terminal.to_string(),
        args,
    }
}

pub fn shell_join(cmd: &[String]) -> String {
    cmd.iter()
        .map(|arg| format!("'{}'", arg.replace('\'', "'\\''")))
        .collect::<Vec<_>>()
        .join(" ")
}

fn spawn_detached(
    program: &str,
    args: &[String],
    cwd: &str,
    path_env: &str,
) -> Result<(), String> {
    // ponytail: child is never reaped — zombie lingers until app exit on unix;
    // double-fork if that ever matters
    Command::new(program)
        .args(args)
        .current_dir(cwd)
        .env("PATH", path_env)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to launch terminal {program}: {e}"))
}

#[cfg(target_os = "linux")]
fn launch_terminal(vault_path: &str, agent_cmd: &[String], path_env: &str) -> Result<(), String> {
    let env_terminal = std::env::var("TERMINAL").ok();
    let terminal = pick_linux_terminal(env_terminal.as_deref(), |t| {
        pipeline::resolve_cli_with_path(t, path_env).status == pipeline::CliProbeStatus::Present
    })
    .ok_or("No terminal emulator found — set $TERMINAL to your terminal command")?;
    let launch = linux_terminal_launch(&terminal, vault_path, agent_cmd);
    spawn_detached(&launch.program, &launch.args, vault_path, path_env)
}

#[cfg(target_os = "macos")]
fn launch_terminal(vault_path: &str, agent_cmd: &[String], path_env: &str) -> Result<(), String> {
    use crate::features::mcp::auth;
    use std::os::unix::fs::PermissionsExt;

    let script_path = auth::token_path()
        .parent()
        .map(|dir| dir.join("agent-handoff.command"))
        .ok_or("Invalid MCP token path")?;
    let script = format!(
        "#!/bin/bash\ncd '{}'\nexec {}\n",
        vault_path.replace('\'', "'\\''"),
        shell_join(agent_cmd)
    );
    std::fs::write(&script_path, script)
        .map_err(|e| format!("Failed to write launcher script: {e}"))?;
    std::fs::set_permissions(&script_path, std::fs::Permissions::from_mode(0o755))
        .map_err(|e| format!("Failed to mark launcher executable: {e}"))?;
    let args = vec![
        "-a".to_string(),
        "Terminal".to_string(),
        script_path.to_string_lossy().to_string(),
    ];
    spawn_detached("open", &args, vault_path, path_env)
}

#[cfg(target_os = "windows")]
fn launch_terminal(vault_path: &str, agent_cmd: &[String], path_env: &str) -> Result<(), String> {
    // ponytail: naive cmd quoting — breaks on paths with quotes; use CREATE_NEW_CONSOLE if it matters
    let inner = agent_cmd
        .iter()
        .map(|a| format!("\"{a}\""))
        .collect::<Vec<_>>()
        .join(" ");
    let args = vec![
        "/C".to_string(),
        "start".to_string(),
        "Carbide Agent".to_string(),
        "cmd".to_string(),
        "/K".to_string(),
        inner,
    ];
    spawn_detached("cmd", &args, vault_path, path_env)
}

#[tauri::command]
#[specta::specta]
pub async fn open_vault_in_agent(
    app: AppHandle,
    provider_config: AiProviderConfig,
    vault_path: String,
) -> Result<(), String> {
    let AiTransport::Cli { command, .. } = &provider_config.transport else {
        return Err(format!(
            "{} does not support agent mode",
            provider_config.name
        ));
    };

    let path_env = pipeline::get_expanded_path();
    let probe = tauri::async_runtime::spawn_blocking({
        let command = command.clone();
        let path = path_env.clone();
        move || pipeline::resolve_cli_with_path(&command, &path)
    })
    .await
    .map_err(|e| e.to_string())?;
    if probe.status != pipeline::CliProbeStatus::Present {
        return Err(cli_probe_error_message(&provider_config.name, &probe));
    }

    let mcp_config_path = prepare_mcp_config(&app)
        .await
        .map_err(|e| format!("Carbide MCP server unavailable: {e}"))?;

    let cli_command = probe.resolved_path.unwrap_or_else(|| command.clone());
    let agent_cmd = build_handoff_command(&cli_command, &mcp_config_path);
    launch_terminal(&vault_path, &agent_cmd, &path_env)
}
