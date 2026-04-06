use serde::Serialize;
use serde_json::Value;

use crate::client::CarbideClient;
use crate::format;

#[derive(Serialize)]
struct ReadParams {
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
