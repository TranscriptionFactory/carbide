use serde::Serialize;
use serde_json::Value;

use crate::client::CarbideClient;
use crate::format;

#[derive(Serialize)]
struct BasesQueryParams {
    vault_id: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    filters: Vec<BasesFilter>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    sort: Vec<BasesSort>,
    limit: usize,
    offset: usize,
}

#[derive(Serialize)]
struct BasesFilter {
    property: String,
    operator: String,
    value: String,
}

#[derive(Serialize)]
struct BasesSort {
    property: String,
    descending: bool,
}

#[derive(Serialize)]
struct VaultIdParams {
    vault_id: String,
}

fn parse_filter(s: &str) -> Option<BasesFilter> {
    let ops = ["!=", ">=", "<=", ">", "<", "="];
    for op in ops {
        if let Some(pos) = s.find(op) {
            let property = s[..pos].trim().to_string();
            let value = s[pos + op.len()..].trim().to_string();
            let operator = match op {
                "=" => "eq",
                "!=" => "neq",
                ">" => "gt",
                "<" => "lt",
                ">=" => "gte",
                "<=" => "lte",
                _ => "eq",
            }
            .to_string();
            if !property.is_empty() {
                return Some(BasesFilter {
                    property,
                    operator,
                    value,
                });
            }
        }
    }
    None
}

fn parse_sort(s: &str) -> BasesSort {
    if let Some(stripped) = s.strip_prefix('-') {
        BasesSort {
            property: stripped.to_string(),
            descending: true,
        }
    } else {
        BasesSort {
            property: s.to_string(),
            descending: false,
        }
    }
}

pub async fn query(
    client: &CarbideClient,
    vault_id: &str,
    filters: &[String],
    sort: &[String],
    limit: usize,
    offset: usize,
    json: bool,
) -> Result<(), String> {
    let parsed_filters: Vec<BasesFilter> = filters.iter().filter_map(|f| parse_filter(f)).collect();
    let parsed_sort: Vec<BasesSort> = sort.iter().map(|s| parse_sort(s)).collect();

    let resp: Value = client
        .post_json(
            "/cli/bases/query",
            &BasesQueryParams {
                vault_id: vault_id.to_string(),
                filters: parsed_filters,
                sort: parsed_sort,
                limit,
                offset,
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        let rows = resp["rows"].as_array();
        let total = resp["total"].as_u64().unwrap_or(0);
        match rows {
            Some(rows) if !rows.is_empty() => {
                for row in rows {
                    let path = row["note"]["path"].as_str().unwrap_or("?");
                    let title = row["note"]["title"].as_str().unwrap_or("");
                    if title.is_empty() {
                        println!("{}", path);
                    } else {
                        println!("{} — {}", path, title);
                    }
                }
                println!("\n{} results (total: {})", rows.len(), total);
            }
            _ => println!("No results found."),
        }
    }
    Ok(())
}

pub async fn properties(
    client: &CarbideClient,
    vault_id: &str,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/bases/properties",
            &VaultIdParams {
                vault_id: vault_id.to_string(),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        let empty = vec![];
        let props = resp.as_array().unwrap_or(&empty);
        for p in props {
            let name = p["name"].as_str().unwrap_or("?");
            let prop_type = p["property_type"].as_str().unwrap_or("string");
            let count = p["count"].as_u64().unwrap_or(0);
            println!("{} ({}) — {} notes", name, prop_type, count);
        }
        println!("\n{} properties", props.len());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_filter_eq() {
        let f = parse_filter("status=draft").unwrap();
        assert_eq!(f.property, "status");
        assert_eq!(f.operator, "eq");
        assert_eq!(f.value, "draft");
    }

    #[test]
    fn test_parse_filter_neq() {
        let f = parse_filter("status!=done").unwrap();
        assert_eq!(f.property, "status");
        assert_eq!(f.operator, "neq");
        assert_eq!(f.value, "done");
    }

    #[test]
    fn test_parse_filter_gt() {
        let f = parse_filter("priority>3").unwrap();
        assert_eq!(f.property, "priority");
        assert_eq!(f.operator, "gt");
        assert_eq!(f.value, "3");
    }

    #[test]
    fn test_parse_filter_invalid() {
        assert!(parse_filter("nooperator").is_none());
    }

    #[test]
    fn test_parse_sort_asc() {
        let s = parse_sort("mtime_ms");
        assert_eq!(s.property, "mtime_ms");
        assert!(!s.descending);
    }

    #[test]
    fn test_parse_sort_desc() {
        let s = parse_sort("-mtime_ms");
        assert_eq!(s.property, "mtime_ms");
        assert!(s.descending);
    }
}
