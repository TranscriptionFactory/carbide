use clap::Subcommand;
use serde::Serialize;
use serde_json::Value;

use crate::client::CarbideClient;
use crate::format;

#[derive(Subcommand)]
pub enum GitAction {
    #[command(about = "Show working tree status")]
    Status,
    #[command(about = "Stage all changes and commit")]
    Commit {
        #[arg(long, short, help = "Commit message")]
        message: String,
        #[arg(long, help = "Specific files to stage (default: all)")]
        files: Option<Vec<String>>,
    },
    #[command(about = "Show commit history")]
    Log {
        #[arg(long, default_value = "20", help = "Max commits")]
        limit: usize,
        #[arg(long, help = "Filter to file path")]
        file: Option<String>,
    },
    #[command(about = "Show uncommitted changes")]
    Diff {
        #[arg(long, help = "Filter to file path")]
        path: Option<String>,
    },
    #[command(about = "Push to remote")]
    Push,
    #[command(about = "Pull from remote")]
    Pull {
        #[arg(long, help = "Merge strategy (merge or rebase)")]
        strategy: Option<String>,
    },
    #[command(about = "Restore a file to a previous commit")]
    Restore {
        #[arg(help = "File path")]
        path: String,
        #[arg(long, help = "Commit hash")]
        commit: String,
    },
    #[command(about = "Initialize git in the vault")]
    Init,
}

#[derive(Serialize)]
struct VaultIdParams {
    vault_id: String,
}

#[derive(Serialize)]
struct CommitParams {
    vault_id: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    files: Option<Vec<String>>,
}

#[derive(Serialize)]
struct LogParams {
    vault_id: String,
    limit: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_path: Option<String>,
}

#[derive(Serialize)]
struct DiffParams {
    vault_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
}

#[derive(Serialize)]
struct PullParams {
    vault_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    strategy: Option<String>,
}

#[derive(Serialize)]
struct RestoreParams {
    vault_id: String,
    path: String,
    commit: String,
}

pub async fn run(
    client: &CarbideClient,
    vault_id: &str,
    action: &GitAction,
    json: bool,
) -> Result<(), String> {
    match action {
        GitAction::Status => status(client, vault_id, json).await,
        GitAction::Commit { message, files } => {
            commit(client, vault_id, message, files.clone(), json).await
        }
        GitAction::Log { limit, file } => log(client, vault_id, *limit, file.as_deref(), json).await,
        GitAction::Diff { path } => diff(client, vault_id, path.as_deref(), json).await,
        GitAction::Push => push(client, vault_id, json).await,
        GitAction::Pull { strategy } => pull(client, vault_id, strategy.clone(), json).await,
        GitAction::Restore { path, commit } => {
            restore(client, vault_id, path, commit, json).await
        }
        GitAction::Init => init(client, vault_id, json).await,
    }
}

async fn status(client: &CarbideClient, vault_id: &str, json: bool) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/git/status",
            &VaultIdParams { vault_id: vault_id.to_string() },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        println!("Branch: {}", resp["branch"].as_str().unwrap_or("?"));
        if resp["is_dirty"].as_bool().unwrap_or(false) {
            let files = resp["files"].as_array();
            let count = files.map(|f| f.len()).unwrap_or(0);
            println!("{} changed file(s)", count);
            if let Some(files) = files {
                for f in files {
                    let status = f["status"].as_str().unwrap_or("?");
                    let path = f["path"].as_str().unwrap_or("?");
                    println!("  {} {}", status, path);
                }
            }
        } else {
            println!("Clean working tree");
        }
        if resp["has_upstream"].as_bool().unwrap_or(false) {
            let ahead = resp["ahead"].as_u64().unwrap_or(0);
            let behind = resp["behind"].as_u64().unwrap_or(0);
            if ahead > 0 {
                println!("Ahead: {}", ahead);
            }
            if behind > 0 {
                println!("Behind: {}", behind);
            }
        }
    }
    Ok(())
}

async fn commit(
    client: &CarbideClient,
    vault_id: &str,
    message: &str,
    files: Option<Vec<String>>,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/git/commit",
            &CommitParams {
                vault_id: vault_id.to_string(),
                message: message.to_string(),
                files,
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        let hash = resp["hash"].as_str().unwrap_or("?");
        println!("Committed: {}", &hash[..7.min(hash.len())]);
    }
    Ok(())
}

async fn log(
    client: &CarbideClient,
    vault_id: &str,
    limit: usize,
    file: Option<&str>,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/git/log",
            &LogParams {
                vault_id: vault_id.to_string(),
                limit,
                file_path: file.map(String::from),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        let empty = vec![];
        let commits = resp.as_array().unwrap_or(&empty);
        if commits.is_empty() {
            println!("No commits found.");
        } else {
            for c in commits {
                let hash = c["short_hash"].as_str().unwrap_or("?");
                let author = c["author"].as_str().unwrap_or("?");
                let msg = c["message"].as_str().unwrap_or("").trim();
                println!("{} {} {}", hash, author, msg);
            }
        }
    }
    Ok(())
}

async fn diff(
    client: &CarbideClient,
    vault_id: &str,
    path: Option<&str>,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/git/diff",
            &DiffParams {
                vault_id: vault_id.to_string(),
                path: path.map(String::from),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        let additions = resp["additions"].as_u64().unwrap_or(0);
        let deletions = resp["deletions"].as_u64().unwrap_or(0);
        let empty = vec![];
        let hunks = resp["hunks"].as_array().unwrap_or(&empty);

        if hunks.is_empty() {
            println!("No changes.");
        } else {
            for hunk in hunks {
                let header = hunk["header"].as_str().unwrap_or("");
                println!("{}", header.trim());
                let lines = hunk["lines"].as_array().unwrap_or(&empty);
                for line in lines {
                    let lt = line["type"].as_str().unwrap_or("context");
                    let content = line["content"].as_str().unwrap_or("");
                    let prefix = match lt {
                        "addition" => "+",
                        "deletion" => "-",
                        _ => " ",
                    };
                    print!("{}{}", prefix, content);
                }
            }
            println!("\n+{} -{}", additions, deletions);
        }
    }
    Ok(())
}

async fn push(client: &CarbideClient, vault_id: &str, json: bool) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/git/push",
            &VaultIdParams { vault_id: vault_id.to_string() },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else if resp["success"].as_bool().unwrap_or(false) {
        println!("{}", resp["message"].as_str().unwrap_or("Pushed successfully"));
    } else {
        return Err(resp["error"].as_str().unwrap_or("push failed").to_string());
    }
    Ok(())
}

async fn pull(
    client: &CarbideClient,
    vault_id: &str,
    strategy: Option<String>,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/git/pull",
            &PullParams {
                vault_id: vault_id.to_string(),
                strategy,
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else if resp["success"].as_bool().unwrap_or(false) {
        println!("{}", resp["message"].as_str().unwrap_or("Pulled successfully"));
    } else {
        return Err(resp["error"].as_str().unwrap_or("pull failed").to_string());
    }
    Ok(())
}

async fn restore(
    client: &CarbideClient,
    vault_id: &str,
    path: &str,
    commit_hash: &str,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/git/restore",
            &RestoreParams {
                vault_id: vault_id.to_string(),
                path: path.to_string(),
                commit: commit_hash.to_string(),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        let hash = resp["hash"].as_str().unwrap_or("?");
        println!("Restored {} to {} (committed as {})", path, &commit_hash[..7.min(commit_hash.len())], &hash[..7.min(hash.len())]);
    }
    Ok(())
}

async fn init(client: &CarbideClient, vault_id: &str, json: bool) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/git/init",
            &VaultIdParams { vault_id: vault_id.to_string() },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        println!("Git initialized in vault");
    }
    Ok(())
}
