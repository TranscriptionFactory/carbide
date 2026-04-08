use std::io::IsTerminal;

use serde::Serialize;
use serde_json::Value;

use crate::client::CarbideClient;
use crate::format;

#[derive(Serialize)]
struct ReadParams {
    vault_id: String,
    path: String,
}

#[derive(Serialize)]
struct CreateParams {
    vault_id: String,
    path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    overwrite: bool,
}

#[derive(Serialize)]
struct WriteParams {
    vault_id: String,
    path: String,
    content: String,
}

#[derive(Serialize)]
struct ContentParams {
    vault_id: String,
    path: String,
    content: String,
}

#[derive(Serialize)]
struct RenameParams {
    vault_id: String,
    path: String,
    new_path: String,
}

#[derive(Serialize)]
struct MoveParams {
    vault_id: String,
    path: String,
    to: String,
}

#[derive(Serialize)]
struct DeletePathParams {
    vault_id: String,
    path: String,
}

pub async fn read(
    client: &CarbideClient,
    vault_id: &str,
    path: &str,
    json: bool,
    raw: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/read",
            &ReadParams {
                vault_id: vault_id.to_string(),
                path: path.to_string(),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        let content = resp["content"].as_str().unwrap_or("");
        if raw || !std::io::stdout().is_terminal() || !try_render_glow(content) {
            print!("{}", content);
        }
    }
    Ok(())
}

fn try_render_glow(content: &str) -> bool {
    let Ok(mut child) = std::process::Command::new("glow")
        .arg("-")
        .stdin(std::process::Stdio::piped())
        .spawn()
    else {
        return false;
    };

    use std::io::Write;
    if let Some(ref mut stdin) = child.stdin {
        let _ = stdin.write_all(content.as_bytes());
    }
    drop(child.stdin.take());

    child.wait().is_ok_and(|s| s.success())
}

#[derive(Serialize)]
struct VaultIdParams {
    vault_id: String,
}

pub async fn open_note(
    client: &CarbideClient,
    vault_id: &str,
    path: &str,
) -> Result<(), String> {
    let vault_resp: Value = client
        .post_json(
            "/cli/vault",
            &VaultIdParams {
                vault_id: vault_id.to_string(),
            },
        )
        .await?;

    let vault_path = vault_resp["path"]
        .as_str()
        .ok_or("could not resolve vault path")?;

    let note_path = if path.ends_with(".md") {
        path.to_string()
    } else {
        format!("{}.md", path)
    };

    let full_path = std::path::Path::new(vault_path).join(&note_path);
    if !full_path.exists() {
        return Err(format!("note not found: {}", full_path.display()));
    }

    open_file(&full_path)
}

fn open_file(path: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg(path);
        c
    };
    #[cfg(target_os = "linux")]
    let mut cmd = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(path);
        c
    };
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", "", &path.to_string_lossy()]);
        c
    };
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    return Err("open is not supported on this platform".into());

    cmd.spawn()
        .map_err(|e| format!("failed to open: {e}"))?
        .wait()
        .map_err(|e| format!("failed to open: {e}"))?;
    Ok(())
}

pub async fn create(
    client: &CarbideClient,
    vault_id: &str,
    path: &str,
    content: Option<&str>,
    overwrite: bool,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/create",
            &CreateParams {
                vault_id: vault_id.to_string(),
                path: path.to_string(),
                content: content.map(String::from),
                overwrite,
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        let out_path = resp["path"].as_str().unwrap_or(path);
        println!("Created {}", out_path);
    }
    Ok(())
}

pub async fn write(
    client: &CarbideClient,
    vault_id: &str,
    path: &str,
    content: &str,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/write",
            &WriteParams {
                vault_id: vault_id.to_string(),
                path: path.to_string(),
                content: content.to_string(),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        println!("Written {}", resp["path"].as_str().unwrap_or(path));
    }
    Ok(())
}

pub async fn append(
    client: &CarbideClient,
    vault_id: &str,
    path: &str,
    content: &str,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/append",
            &ContentParams {
                vault_id: vault_id.to_string(),
                path: path.to_string(),
                content: content.to_string(),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        println!("Appended to {}", resp["path"].as_str().unwrap_or(path));
    }
    Ok(())
}

pub async fn prepend(
    client: &CarbideClient,
    vault_id: &str,
    path: &str,
    content: &str,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/prepend",
            &ContentParams {
                vault_id: vault_id.to_string(),
                path: path.to_string(),
                content: content.to_string(),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        println!("Prepended to {}", resp["path"].as_str().unwrap_or(path));
    }
    Ok(())
}

pub async fn rename(
    client: &CarbideClient,
    vault_id: &str,
    path: &str,
    new_path: &str,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/rename",
            &RenameParams {
                vault_id: vault_id.to_string(),
                path: path.to_string(),
                new_path: new_path.to_string(),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        println!(
            "Renamed {} -> {}",
            path,
            resp["path"].as_str().unwrap_or(new_path)
        );
    }
    Ok(())
}

pub async fn move_note(
    client: &CarbideClient,
    vault_id: &str,
    path: &str,
    to: &str,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/move",
            &MoveParams {
                vault_id: vault_id.to_string(),
                path: path.to_string(),
                to: to.to_string(),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        println!("Moved to {}", resp["path"].as_str().unwrap_or(to));
    }
    Ok(())
}

pub async fn delete(
    client: &CarbideClient,
    vault_id: &str,
    path: &str,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/delete",
            &DeletePathParams {
                vault_id: vault_id.to_string(),
                path: path.to_string(),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        println!("Deleted {}", resp["path"].as_str().unwrap_or(path));
    }
    Ok(())
}
