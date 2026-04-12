use serde::Serialize;
use serde_json::Value;

use crate::client::CarbideClient;
use crate::format;

#[derive(Serialize)]
struct VaultIdParams {
    vault_id: String,
}

pub async fn index_build(client: &CarbideClient, vault_id: &str, json: bool) -> Result<(), String> {
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

pub async fn schema(client: &CarbideClient, json: bool) -> Result<(), String> {
    let resp: Value = client
        .post_json("/cli/dev/schema", &serde_json::json!({}))
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        let empty = vec![];
        let tools = resp.as_array().unwrap_or(&empty);
        for tool in tools {
            let name = tool["name"].as_str().unwrap_or("?");
            let desc = tool["description"].as_str().unwrap_or("");
            println!("{}", name);
            println!("  {}", desc);

            if let Some(props) = tool["inputSchema"]["properties"].as_object() {
                let required: Vec<&str> = tool["inputSchema"]["required"]
                    .as_array()
                    .map(|a| a.iter().filter_map(|v| v.as_str()).collect())
                    .unwrap_or_default();

                for (key, schema) in props {
                    let prop_type = schema["type"].as_str().unwrap_or("?");
                    let marker = if required.contains(&key.as_str()) {
                        " *"
                    } else {
                        ""
                    };
                    let prop_desc = schema["description"].as_str().unwrap_or("");
                    println!("    {}: {}{} — {}", key, prop_type, marker, prop_desc);
                }
            }
            println!();
        }
        println!("{} tools", tools.len());
    }
    Ok(())
}

pub async fn mcp_inspect(client: &CarbideClient, json: bool) -> Result<(), String> {
    let resp: Value = client
        .post_json("/cli/mcp/inspect", &serde_json::json!({}))
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        println!("Server");
        println!("  name: {}", resp["server"]["name"].as_str().unwrap_or("?"));
        println!(
            "  version: {}",
            resp["server"]["version"].as_str().unwrap_or("?")
        );
        println!(
            "  protocol: {}",
            resp["server"]["protocol_version"].as_str().unwrap_or("?")
        );

        println!("\nTransport");
        println!(
            "  http: {}",
            resp["transport"]["http_url"].as_str().unwrap_or("?")
        );
        println!(
            "  stdio: {}",
            resp["transport"]["stdio_command"].as_str().unwrap_or("?")
        );
        println!(
            "  port: {}",
            resp["transport"]["port"].as_u64().unwrap_or(0)
        );

        println!("\nAuth");
        println!(
            "  method: {}",
            resp["auth"]["method"].as_str().unwrap_or("?")
        );
        println!(
            "  token: {}",
            resp["auth"]["token_location"].as_str().unwrap_or("?")
        );

        println!(
            "\n{} tools available",
            resp["tool_count"].as_u64().unwrap_or(0)
        );
    }
    Ok(())
}
