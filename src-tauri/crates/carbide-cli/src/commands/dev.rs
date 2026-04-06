use serde::Serialize;
use serde_json::Value;

use crate::client::CarbideClient;
use crate::format;

#[derive(Serialize)]
struct VaultIdParams {
    vault_id: String,
}

pub async fn index_build(
    client: &CarbideClient,
    vault_id: &str,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/dev/index/build",
            &VaultIdParams {
                vault_id: vault_id.to_string(),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        println!("Index build started.");
    }
    Ok(())
}

pub async fn index_rebuild(
    client: &CarbideClient,
    vault_id: &str,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/dev/index/rebuild",
            &VaultIdParams {
                vault_id: vault_id.to_string(),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        println!("Index rebuild started.");
    }
    Ok(())
}
