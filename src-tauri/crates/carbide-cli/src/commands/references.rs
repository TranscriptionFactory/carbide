use serde::Serialize;
use serde_json::Value;

use crate::client::CarbideClient;
use crate::format;

#[derive(Serialize)]
struct VaultIdParams {
    vault_id: String,
}

#[derive(Serialize)]
struct SearchParams {
    vault_id: String,
    query: String,
}

#[derive(Serialize)]
struct AddParams {
    vault_id: String,
    doi: String,
}

#[derive(Serialize)]
struct BbtSearchParams {
    query: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    bbt_url: Option<String>,
}

fn format_item(item: &Value) -> String {
    let id = item["id"].as_str().unwrap_or("?");
    let title = item["title"].as_str().unwrap_or("(no title)");
    let authors = item["author"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    let family = a["family"].as_str()?;
                    Some(family.to_string())
                })
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();
    if authors.is_empty() {
        format!("[{}] {}", id, title)
    } else {
        format!("[{}] {} — {}", id, title, authors)
    }
}

pub async fn list(client: &CarbideClient, vault_id: &str, json: bool) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/references",
            &VaultIdParams { vault_id: vault_id.to_string() },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        let empty = vec![];
        let items = resp.as_array().unwrap_or(&empty);
        if items.is_empty() {
            println!("No references found.");
        } else {
            for item in items {
                println!("{}", format_item(item));
            }
            println!("\n{} references", items.len());
        }
    }
    Ok(())
}

pub async fn search(
    client: &CarbideClient,
    vault_id: &str,
    query: &str,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/references/search",
            &SearchParams {
                vault_id: vault_id.to_string(),
                query: query.to_string(),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        let empty = vec![];
        let items = resp.as_array().unwrap_or(&empty);
        if items.is_empty() {
            println!("No matches found.");
        } else {
            for item in items {
                println!("{}", format_item(item));
            }
            println!("\n{} matches", items.len());
        }
    }
    Ok(())
}

pub async fn add(
    client: &CarbideClient,
    vault_id: &str,
    doi: &str,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/references/add",
            &AddParams {
                vault_id: vault_id.to_string(),
                doi: doi.to_string(),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        println!("Added: {}", format_item(&resp));
    }
    Ok(())
}

pub async fn bbt_search(
    client: &CarbideClient,
    query: &str,
    limit: Option<u32>,
    bbt_url: Option<&str>,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/references/bbt/search",
            &BbtSearchParams {
                query: query.to_string(),
                limit,
                bbt_url: bbt_url.map(String::from),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        let empty = vec![];
        let items = resp.as_array().unwrap_or(&empty);
        if items.is_empty() {
            println!("No BBT results found.");
        } else {
            for item in items {
                let key = item["citekey"]
                    .as_str()
                    .or_else(|| item["id"].as_str())
                    .unwrap_or("?");
                let title = item["title"].as_str().unwrap_or("(no title)");
                println!("[{}] {}", key, title);
            }
            println!("\n{} results", items.len());
        }
    }
    Ok(())
}
