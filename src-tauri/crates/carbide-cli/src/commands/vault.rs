use serde::Serialize;
use serde_json::Value;

use crate::client::CarbideClient;
use crate::format;

#[derive(Serialize)]
struct VaultIdParams {
    vault_id: String,
}

pub async fn vault(client: &CarbideClient, vault_id: &str, json: bool) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/vault",
            &VaultIdParams {
                vault_id: vault_id.to_string(),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        let name = resp["name"].as_str().unwrap_or("?");
        let path = resp["path"].as_str().unwrap_or("?");
        let id = resp["id"].as_str().unwrap_or("?");
        println!("{}", name);
        println!("  path: {}", path);
        println!("  id:   {}", id);
    }
    Ok(())
}

pub async fn vaults(client: &CarbideClient, json: bool) -> Result<(), String> {
    let resp: Value = client.post_raw("/cli/vaults", &()).await.and_then(|body| {
        serde_json::from_str(&body).map_err(|e| format!("invalid JSON: {e}"))
    })?;

    if json {
        format::print_json(&resp);
    } else {
        let empty = vec![];
        let vaults = resp.as_array().unwrap_or(&empty);
        for v in vaults {
            let name = v["name"].as_str().unwrap_or("?");
            let path = v["path"].as_str().unwrap_or("?");
            println!("{} ({})", name, path);
        }
        println!("\n{} vaults", vaults.len());
    }
    Ok(())
}
