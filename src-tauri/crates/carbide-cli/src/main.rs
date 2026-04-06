mod auth;
mod client;
mod commands;
mod format;

use clap::{Parser, Subcommand};

use client::CarbideClient;

#[derive(Parser)]
#[command(name = "carbide", about = "CLI client for Carbide note-taking app")]
struct Cli {
    #[arg(long, global = true, help = "Vault ID (defaults to active vault)")]
    vault: Option<String>,
    #[arg(long, global = true, help = "Output as JSON")]
    json: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    #[command(about = "Read a note")]
    Read {
        #[arg(help = "Note path (relative to vault root)")]
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
    #[command(about = "Show app status")]
    Status,
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

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    let client = match CarbideClient::new() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("error: {}", e);
            std::process::exit(1);
        }
    };

    if let Err(e) = client.health().await {
        eprintln!("error: {}", e);
        eprintln!("Is Carbide running?");
        std::process::exit(1);
    }

    let result = match cli.command {
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
        Command::Status => unreachable!(),
    }
}
