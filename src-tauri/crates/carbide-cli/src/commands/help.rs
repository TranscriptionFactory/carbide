use serde::Serialize;
use serde_json::Value;

use crate::client::CarbideClient;
use crate::format;

const URI_SCHEME: &str = "carbide://";

#[derive(Serialize)]
struct ReadParams {
    uri: String,
}

/// Accepts a full `carbide://` resource URI or a bare guide slug.
fn resolve_topic(topic: &str) -> String {
    if topic.starts_with(URI_SCHEME) {
        topic.to_string()
    } else {
        format!("{}help/{}", URI_SCHEME, topic)
    }
}

pub async fn list(client: &CarbideClient, json: bool) -> Result<(), String> {
    let resp: Value = client.post_json("/cli/help", &()).await?;

    if json {
        format::print_json(&resp);
        return Ok(());
    }

    let empty = vec![];
    let resources = resp["resources"].as_array().unwrap_or(&empty);
    for resource in resources {
        println!(
            "{}\t{}",
            resource["uri"].as_str().unwrap_or("?"),
            resource["name"].as_str().unwrap_or("?")
        );
    }
    println!("\n{} topics", resources.len());
    Ok(())
}

pub async fn read(client: &CarbideClient, topic: &str, json: bool) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/help/read",
            &ReadParams {
                uri: resolve_topic(topic),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        println!("{}", resp["text"].as_str().unwrap_or(""));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::resolve_topic;

    #[test]
    fn bare_slugs_become_guide_uris() {
        assert_eq!(
            resolve_topic("getting_started"),
            "carbide://help/getting_started"
        );
    }

    #[test]
    fn full_uris_pass_through_untouched() {
        for uri in [
            "carbide://help/getting_started",
            "carbide://plugin/smart-templates/help",
        ] {
            assert_eq!(resolve_topic(uri), uri);
        }
    }
}
