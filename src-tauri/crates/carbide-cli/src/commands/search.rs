use serde::Serialize;
use serde_json::Value;

use crate::client::CarbideClient;
use crate::format;

#[derive(Serialize)]
struct SearchParams {
    vault_id: String,
    query: String,
    limit: usize,
}

#[derive(Serialize)]
struct VaultIdParams {
    vault_id: String,
}

#[derive(Serialize)]
struct FilesParams {
    vault_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    folder: Option<String>,
    limit: usize,
    offset: usize,
}

#[derive(Serialize)]
struct OutlineParams {
    vault_id: String,
    path: String,
}

#[derive(Serialize)]
struct NotesForTagParams {
    vault_id: String,
    tag: String,
}

pub async fn reindex(client: &CarbideClient, vault_id: &str, json: bool) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/reindex",
            &VaultIdParams {
                vault_id: vault_id.to_string(),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        println!("Reindex started.");
    }
    Ok(())
}

fn truncate_preview(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    let keep = max_chars.saturating_sub(3);
    let truncated: String = text.chars().take(keep).collect();
    format!("{truncated}...")
}

pub async fn search(
    client: &CarbideClient,
    vault_id: &str,
    query: &str,
    limit: usize,
    json: bool,
    paths_only: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/search",
            &SearchParams {
                vault_id: vault_id.to_string(),
                query: query.to_string(),
                limit,
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        let empty = vec![];
        let hits = resp.as_array().unwrap_or(&empty);
        if hits.is_empty() {
            println!("No results found.");
            return Ok(());
        }
        for hit in hits {
            let path = hit["note"]["path"].as_str().unwrap_or("?");
            if paths_only {
                println!("{}", path);
                continue;
            }
            let score = hit["score"].as_f64().unwrap_or(0.0);
            let snippet = hit["snippet"].as_str().unwrap_or("");
            println!("{} (score: {:.2})", path, score);
            if !snippet.is_empty() {
                let trimmed = snippet.trim().replace('\n', " ");
                println!("  {}", truncate_preview(&trimmed, 120));
            }
        }
    }
    Ok(())
}

pub async fn files(
    client: &CarbideClient,
    vault_id: &str,
    folder: Option<&str>,
    limit: usize,
    offset: usize,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/files",
            &FilesParams {
                vault_id: vault_id.to_string(),
                folder: folder.map(String::from),
                limit,
                offset,
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        let total = resp["total"].as_u64().unwrap_or(0);
        let empty = vec![];
        let notes = resp["items"].as_array().unwrap_or(&empty);
        let paths: Vec<String> = notes
            .iter()
            .filter_map(|n| n["path"].as_str().map(String::from))
            .collect();
        format::print_lines(&paths);
        println!(
            "\nShowing {} of {} files (offset {})",
            paths.len(),
            total,
            offset
        );
    }
    Ok(())
}

pub async fn tags(
    client: &CarbideClient,
    vault_id: &str,
    json: bool,
    filter: Option<&str>,
) -> Result<(), String> {
    if let Some(tag) = filter {
        return notes_by_tag(client, vault_id, tag, json).await;
    }

    let resp: Value = client
        .post_json(
            "/cli/tags",
            &VaultIdParams {
                vault_id: vault_id.to_string(),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        let empty = vec![];
        let tags = resp.as_array().unwrap_or(&empty);
        for tag in tags {
            let name = tag["tag"].as_str().unwrap_or("?");
            let count = tag["count"].as_u64().unwrap_or(0);
            println!("{} ({})", name, count);
        }
        println!("\n{} tags", tags.len());
    }
    Ok(())
}

async fn notes_by_tag(
    client: &CarbideClient,
    vault_id: &str,
    tag: &str,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/notes_by_tag",
            &NotesForTagParams {
                vault_id: vault_id.to_string(),
                tag: tag.to_string(),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        let empty = vec![];
        let paths = resp.as_array().unwrap_or(&empty);
        if paths.is_empty() {
            println!("No notes with tag \"{}\".", tag);
            return Ok(());
        }
        for p in paths {
            println!("{}", p.as_str().unwrap_or("?"));
        }
        println!("\n{} notes", paths.len());
    }
    Ok(())
}

pub async fn outline(
    client: &CarbideClient,
    vault_id: &str,
    path: &str,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/outline",
            &OutlineParams {
                vault_id: vault_id.to_string(),
                path: path.to_string(),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        let empty = vec![];
        let headings = resp.as_array().unwrap_or(&empty);
        if headings.is_empty() {
            println!("No headings found.");
            return Ok(());
        }
        for h in headings {
            let level = h["level"].as_u64().unwrap_or(1) as usize;
            let text = h["text"].as_str().unwrap_or("");
            println!(
                "{}",
                format::indent_tree(
                    &format::format_heading(level as u32, text),
                    level.saturating_sub(1)
                )
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::truncate_preview;

    #[test]
    fn returns_text_unchanged_when_within_limit() {
        assert_eq!(truncate_preview("short snippet", 120), "short snippet");
    }

    #[test]
    fn truncates_long_ascii_with_ellipsis() {
        let long = "a".repeat(200);
        let out = truncate_preview(&long, 120);
        assert_eq!(out.chars().count(), 120);
        assert!(out.ends_with("..."));
    }

    #[test]
    fn does_not_split_multibyte_char_at_boundary() {
        // '→' is 3 bytes; placed so a byte-index slice at 117 would land mid-char.
        let snippet = format!("{}→ tail", "x".repeat(116));
        let out = truncate_preview(&snippet, 120);
        assert!(out.ends_with("..."));
        assert!(out.is_char_boundary(out.len()));
        assert_eq!(out.chars().count(), 120);
    }
}
