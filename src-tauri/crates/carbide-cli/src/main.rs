mod auth;
mod client;
mod commands;
mod completions;
mod format;
mod install;
mod mcp;
mod setup;

use clap::{CommandFactory, Parser, Subcommand};
use clap_complete::Shell;

use client::CarbideClient;

const EXIT_NOT_FOUND: i32 = 2;
const EXIT_SERVER: i32 = 3;

#[derive(Parser)]
#[command(
    name = "carbide",
    about = "CLI client for Carbide note-taking app",
    version
)]
struct Cli {
    #[arg(long, global = true, help = "Vault ID (defaults to active vault)")]
    vault: Option<String>,
    #[arg(long, global = true, help = "Output as JSON")]
    json: bool,
    #[arg(
        long,
        help = r"Install CLI at ~/.local/bin/carbide (macOS/Linux) or %LOCALAPPDATA%\Programs\Carbide\bin\carbide.exe (Windows)"
    )]
    install_cli: bool,
    #[arg(
        long,
        help = r"Remove CLI from ~/.local/bin/carbide (macOS/Linux) or %LOCALAPPDATA%\Programs\Carbide\bin\carbide.exe (Windows)"
    )]
    uninstall_cli: bool,
    #[arg(long, help = "Generate shell completions", value_name = "SHELL")]
    completions: Option<Shell>,
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand)]
enum Command {
    #[command(about = "Read a note")]
    Read {
        #[arg(help = "Note path (relative to vault root)")]
        path: String,
        #[arg(long, help = "Output raw markdown (skip glow rendering)")]
        raw: bool,
    },
    #[command(
        about = "Read a note (raw output, alias for read --raw)",
        visible_alias = "cat"
    )]
    Cat {
        #[arg(help = "Note path (relative to vault root)")]
        path: String,
    },
    #[command(about = "Open a note in the default app")]
    Open {
        #[arg(help = "Note path (relative to vault root)")]
        path: String,
    },
    #[command(about = "Open a note in $EDITOR")]
    Edit {
        #[arg(help = "Note path (relative to vault root)")]
        path: String,
    },
    #[command(about = "Create a new note")]
    Create {
        #[arg(help = "Note path (relative to vault root)")]
        path: String,
        #[arg(long, help = "Initial content")]
        content: Option<String>,
        #[arg(long, help = "Overwrite if exists")]
        overwrite: bool,
    },
    #[command(about = "Write content to a note (replaces existing content)")]
    Write {
        #[arg(help = "Note path (relative to vault root)")]
        path: String,
        #[arg(long, help = "New content")]
        content: String,
    },
    #[command(about = "Append content to a note")]
    Append {
        #[arg(help = "Note path (relative to vault root)")]
        path: String,
        #[arg(long, help = "Content to append")]
        content: String,
    },
    #[command(about = "Prepend content after frontmatter")]
    Prepend {
        #[arg(help = "Note path (relative to vault root)")]
        path: String,
        #[arg(long, help = "Content to prepend")]
        content: String,
    },
    #[command(about = "Rename a note")]
    Rename {
        #[arg(help = "Current note path")]
        path: String,
        #[arg(long, help = "New path")]
        new_path: String,
    },
    #[command(name = "move", about = "Move a note to a different folder")]
    Move {
        #[arg(help = "Note path")]
        path: String,
        #[arg(long, help = "Target folder")]
        to: String,
    },
    #[command(about = "Delete a note")]
    Delete {
        #[arg(help = "Note path")]
        path: String,
    },
    #[command(about = "Search notes")]
    Search {
        #[arg(help = "Search query")]
        query: String,
        #[arg(long, default_value = "50", help = "Max results")]
        limit: usize,
        #[arg(long, help = "Output only paths (one per line)")]
        paths_only: bool,
    },
    #[command(about = "List files in vault")]
    Files {
        #[arg(long, help = "Filter by folder")]
        folder: Option<String>,
    },
    #[command(about = "List tags in vault")]
    Tags {
        #[arg(long, help = "Show notes with this tag")]
        filter: Option<String>,
    },
    #[command(about = "Show headings for a note")]
    Outline {
        #[arg(help = "Note path (relative to vault root)")]
        path: String,
    },
    #[command(about = "Show active vault info")]
    Vault,
    #[command(about = "List known vaults")]
    Vaults,
    #[command(about = "Rebuild the search index")]
    Reindex,
    #[command(about = "Show app status")]
    Status,
    #[command(
        about = "Run as MCP stdio proxy (reads JSON-RPC from stdin, proxies to HTTP server)"
    )]
    Mcp,
    #[command(about = "Configure MCP integration")]
    Setup {
        #[command(subcommand)]
        target: SetupTarget,
    },
}

#[derive(Subcommand)]
enum SetupTarget {
    #[command(about = "Configure Claude Desktop MCP integration (stdio transport)")]
    Desktop,
    #[command(about = "Configure Claude Code MCP integration (.mcp.json in vault root)")]
    Code {
        #[arg(help = "Path to vault directory")]
        vault_path: String,
    },
}

async fn resolve_vault(client: &CarbideClient, explicit: Option<&str>) -> Result<String, String> {
    if let Some(id) = explicit {
        return Ok(id.to_string());
    }
    let resp: serde_json::Value = client
        .post_json("/cli/status", &serde_json::json!({}))
        .await?;
    resp["active_vault_id"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| {
            "no active vault. Open Carbide and select a vault, or pass --vault <id>".to_string()
        })
}

async fn ensure_running_with_timeout(
    client: &CarbideClient,
    timeout: std::time::Duration,
) -> Result<(), String> {
    if client.health().await.is_ok() {
        return Ok(());
    }

    eprintln!("Carbide is not running. Attempting to launch...");
    launch_app()?;

    let poll_interval = std::time::Duration::from_millis(500);
    let deadline = std::time::Instant::now() + timeout;

    while std::time::Instant::now() < deadline {
        tokio::time::sleep(poll_interval).await;
        if client.health().await.is_ok() {
            eprintln!("Carbide is ready.");
            return Ok(());
        }
    }

    Err(format!(
        "timed out waiting for Carbide to start ({}s). Launch it manually and retry.",
        timeout.as_secs()
    ))
}

fn launch_app() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-a")
            .arg("Carbide")
            .spawn()
            .map_err(|e| format!("failed to launch Carbide.app: {e}"))?;
        Ok(())
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("carbide")
            .spawn()
            .map_err(|e| format!("failed to launch carbide: {e}"))?;
        Ok(())
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", "Carbide.exe"])
            .spawn()
            .map_err(|e| format!("failed to launch Carbide.exe: {e}"))?;
        Ok(())
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("auto-launch not supported on this platform. Start Carbide manually.".into())
    }
}

fn generate_completions(shell: Shell) {
    completions::generate(shell);
}

fn classify_error(msg: &str) -> i32 {
    if msg.contains("not found") || msg.contains("does not exist") {
        EXIT_NOT_FOUND
    } else if msg.contains("cannot reach") || msg.contains("timed out") {
        EXIT_SERVER
    } else {
        1
    }
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    if let Some(shell) = cli.completions {
        generate_completions(shell);
        return;
    }

    if cli.install_cli {
        if let Err(e) = install::install_cli() {
            eprintln!("error: {}", e);
            std::process::exit(1);
        }
        return;
    }

    if cli.uninstall_cli {
        if let Err(e) = install::uninstall_cli() {
            eprintln!("error: {}", e);
            std::process::exit(1);
        }
        return;
    }

    let command = match cli.command {
        Some(cmd) => cmd,
        None => {
            let _ = Cli::command().print_help();
            eprintln!();
            std::process::exit(1);
        }
    };

    // Setup commands don't need the server running
    if let Command::Setup { ref target } = command {
        let result = match target {
            SetupTarget::Desktop => setup::setup_desktop(),
            SetupTarget::Code { vault_path } => setup::setup_code(vault_path),
        };
        if let Err(e) = result {
            eprintln!("error: {}", e);
            std::process::exit(1);
        }
        return;
    }

    let client = match CarbideClient::new() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("error: {}", e);
            std::process::exit(1);
        }
    };

    // MCP proxy gets a longer timeout for cold launch
    let timeout = match command {
        Command::Mcp => std::time::Duration::from_secs(30),
        _ => std::time::Duration::from_secs(10),
    };
    if let Err(e) = ensure_running_with_timeout(&client, timeout).await {
        eprintln!("error: {}", e);
        std::process::exit(EXIT_SERVER);
    }

    let result = match command {
        Command::Mcp => mcp::run_proxy(&client).await,
        Command::Status => {
            let raw = client.post_raw("/cli/status", &serde_json::json!({})).await;
            match raw {
                Ok(body) => {
                    if cli.json {
                        println!("{}", body);
                    } else {
                        let v: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
                        println!("Carbide is running");
                        println!("  version: {}", v["version"].as_str().unwrap_or("?"));
                        match v["active_vault_id"].as_str() {
                            Some(id) => println!("  active vault: {}", id),
                            None => println!("  active vault: (none)"),
                        }
                        println!("  mcp endpoint: http://127.0.0.1:3457/mcp");
                        println!(
                            "  cli installed: {}",
                            if setup::cli_installed() { "yes" } else { "no" }
                        );
                    }
                    Ok(())
                }
                Err(e) => Err(e),
            }
        }
        Command::Vaults => commands::vault::vaults(&client, cli.json).await,
        Command::Setup { .. } => unreachable!(),
        command => {
            let vault_id = match resolve_vault(&client, cli.vault.as_deref()).await {
                Ok(v) => v,
                Err(e) => {
                    eprintln!("error: {}", e);
                    std::process::exit(1);
                }
            };
            run_command(&client, command, &vault_id, cli.json).await
        }
    };

    if let Err(e) = result {
        let code = classify_error(&e);
        eprintln!("error: {}", e);
        std::process::exit(code);
    }
}

async fn run_command(
    client: &CarbideClient,
    command: Command,
    vault_id: &str,
    json: bool,
) -> Result<(), String> {
    match command {
        Command::Read { path, raw } => {
            commands::notes::read(client, vault_id, &path, json, raw).await
        }
        Command::Cat { path } => commands::notes::read(client, vault_id, &path, json, true).await,
        Command::Open { path } => commands::notes::open_note(client, vault_id, &path).await,
        Command::Edit { path } => commands::notes::edit_note(client, vault_id, &path).await,
        Command::Create {
            path,
            content,
            overwrite,
        } => {
            commands::notes::create(client, vault_id, &path, content.as_deref(), overwrite, json)
                .await
        }
        Command::Write { path, content } => {
            commands::notes::write(client, vault_id, &path, &content, json).await
        }
        Command::Append { path, content } => {
            commands::notes::append(client, vault_id, &path, &content, json).await
        }
        Command::Prepend { path, content } => {
            commands::notes::prepend(client, vault_id, &path, &content, json).await
        }
        Command::Rename { path, new_path } => {
            commands::notes::rename(client, vault_id, &path, &new_path, json).await
        }
        Command::Move { path, to } => {
            commands::notes::move_note(client, vault_id, &path, &to, json).await
        }
        Command::Delete { path } => commands::notes::delete(client, vault_id, &path, json).await,
        Command::Search {
            query,
            limit,
            paths_only,
        } => commands::search::search(client, vault_id, &query, limit, json, paths_only).await,
        Command::Files { folder } => {
            commands::search::files(client, vault_id, folder.as_deref(), json).await
        }
        Command::Tags { filter } => {
            commands::search::tags(client, vault_id, json, filter.as_deref()).await
        }
        Command::Outline { path } => commands::search::outline(client, vault_id, &path, json).await,
        Command::Vault => commands::vault::vault(client, vault_id, json).await,
        Command::Reindex => commands::search::reindex(client, vault_id, json).await,
        Command::Status | Command::Vaults | Command::Mcp | Command::Setup { .. } => {
            unreachable!()
        }
    }
}
