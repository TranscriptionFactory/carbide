mod auth;
mod client;
mod commands;
mod format;
mod install;

use clap::{CommandFactory, Parser, Subcommand};
use clap_complete::Shell;

use client::CarbideClient;

#[derive(Parser)]
#[command(name = "carbide", about = "CLI client for Carbide note-taking app", version)]
struct Cli {
    #[arg(long, global = true, help = "Vault ID (defaults to active vault)")]
    vault: Option<String>,
    #[arg(long, global = true, help = "Output as JSON")]
    json: bool,
    #[arg(long, help = "Create symlink at /usr/local/bin/carbide")]
    install_cli: bool,
    #[arg(long, help = "Remove symlink at /usr/local/bin/carbide")]
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
    },
    #[command(about = "List files in vault")]
    Files {
        #[arg(long, help = "Filter by folder")]
        folder: Option<String>,
    },
    #[command(about = "List tags in vault")]
    Tags,
    #[command(about = "Show headings for a note")]
    Outline {
        #[arg(help = "Note path (relative to vault root)")]
        path: String,
    },
    #[command(about = "Show active vault info")]
    Vault,
    #[command(about = "List known vaults")]
    Vaults,
    #[command(about = "Show app status")]
    Status,
    #[command(about = "Git operations")]
    Git {
        #[command(subcommand)]
        action: commands::git::GitAction,
    },
    #[command(about = "List citation library entries")]
    References,
    #[command(name = "reference:search", about = "Search citation library")]
    ReferenceSearch {
        #[arg(help = "Search query")]
        query: String,
    },
    #[command(name = "reference:add", about = "Add a citation by DOI lookup")]
    ReferenceAdd {
        #[arg(help = "DOI identifier")]
        doi: String,
    },
    #[command(name = "reference:bbt", about = "Search Zotero Better BibTeX")]
    ReferenceBbt {
        #[arg(help = "Search query")]
        query: String,
        #[arg(long, help = "Max results")]
        limit: Option<u32>,
        #[arg(long, help = "BBT JSON-RPC URL")]
        bbt_url: Option<String>,
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
        .ok_or_else(|| "no active vault. Open Carbide and select a vault, or pass --vault <id>".to_string())
}

async fn ensure_running(client: &CarbideClient) -> Result<(), String> {
    if client.health().await.is_ok() {
        return Ok(());
    }

    eprintln!("Carbide is not running. Attempting to launch...");
    launch_app()?;

    let poll_interval = std::time::Duration::from_millis(500);
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);

    while std::time::Instant::now() < deadline {
        tokio::time::sleep(poll_interval).await;
        if client.health().await.is_ok() {
            eprintln!("Carbide is ready.");
            return Ok(());
        }
    }

    Err("timed out waiting for Carbide to start (10s). Launch it manually and retry.".into())
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
    let mut cmd = Cli::command();
    clap_complete::generate(shell, &mut cmd, "carbide", &mut std::io::stdout());
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

    let client = match CarbideClient::new() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("error: {}", e);
            std::process::exit(1);
        }
    };

    if let Err(e) = ensure_running(&client).await {
        eprintln!("error: {}", e);
        std::process::exit(1);
    }

    let result = match command {
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
                    }
                    Ok(())
                }
                Err(e) => Err(e),
            }
        }
        Command::Vaults => commands::vault::vaults(&client, cli.json).await,
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
        eprintln!("error: {}", e);
        std::process::exit(1);
    }
}

async fn run_command(
    client: &CarbideClient,
    command: Command,
    vault_id: &str,
    json: bool,
) -> Result<(), String> {
    match command {
        Command::Read { path } => commands::notes::read(client, vault_id, &path, json).await,
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
        Command::Search { query, limit } => {
            commands::search::search(client, vault_id, &query, limit, json).await
        }
        Command::Files { folder } => {
            commands::search::files(client, vault_id, folder.as_deref(), json).await
        }
        Command::Tags => commands::search::tags(client, vault_id, json).await,
        Command::Outline { path } => {
            commands::search::outline(client, vault_id, &path, json).await
        }
        Command::Vault => commands::vault::vault(client, vault_id, json).await,
        Command::Git { ref action } => commands::git::run(client, vault_id, action, json).await,
        Command::References => commands::references::list(client, vault_id, json).await,
        Command::ReferenceSearch { ref query } => {
            commands::references::search(client, vault_id, query, json).await
        }
        Command::ReferenceAdd { ref doi } => {
            commands::references::add(client, vault_id, doi, json).await
        }
        Command::ReferenceBbt {
            ref query,
            limit,
            ref bbt_url,
        } => {
            commands::references::bbt_search(client, query, limit, bbt_url.as_deref(), json).await
        }
        Command::Status | Command::Vaults => unreachable!(),
    }
}
