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

pub async fn read(client: &CarbideClient, vault_id: &str, path: &str, json: bool) -> Result<(), String> {
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
        print!(
            "{}",
            resp["content"].as_str().unwrap_or("")
        );
    }
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
        println!("Renamed {} -> {}", path, resp["path"].as_str().unwrap_or(new_path));
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
