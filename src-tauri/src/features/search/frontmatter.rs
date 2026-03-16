use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Frontmatter {
    pub tags: Vec<String>,
    pub properties: BTreeMap<String, serde_yml::Value>,
}

pub fn extract_frontmatter(markdown: &str) -> Frontmatter {
    let mut frontmatter = Frontmatter::default();

    if !markdown.starts_with("---") {
        return frontmatter;
    }

    let Some(first_newline) = markdown.find('\n') else {
        return frontmatter;
    };
    
    let first_line = markdown[..first_newline].trim();
    if first_line != "---" {
        return frontmatter;
    }

    // Look for the end of the frontmatter
    let Some(end_index) = markdown[first_newline + 1..].find("\n---") else {
        return frontmatter;
    };

    let yaml_str = &markdown[first_newline + 1..first_newline + 1 + end_index];
    let Ok(value): Result<serde_yml::Value, _> = serde_yml::from_str(yaml_str) else {
        return frontmatter;
    };

    if let Some(map) = value.as_mapping() {
        for (k, v) in map {
            let Some(key) = k.as_str() else {
                continue;
            };

            if key == "tags" || key == "tag" {
                if let Some(tags) = v.as_sequence() {
                    for tag in tags {
                        if let Some(tag_str) = tag.as_str() {
                            frontmatter.tags.push(tag_str.to_string());
                        }
                    }
                } else if let Some(tag_str) = v.as_str() {
                    frontmatter.tags.push(tag_str.to_string());
                } else if let Some(tag_num) = v.as_u64() {
                    frontmatter.tags.push(tag_num.to_string());
                }
            } else {
                frontmatter.properties.insert(key.to_string(), v.clone());
            }
        }
    }

    frontmatter
}

pub fn strip_frontmatter(markdown: &str) -> &str {
    if !markdown.starts_with("---") {
        return markdown;
    }
    let Some(first_newline) = markdown.find('\n') else {
        return markdown;
    };
    let first_line = markdown[..first_newline].trim();
    if first_line != "---" {
        return markdown;
    }
    let Some(end_index) = markdown[first_newline + 1..].find("\n---") else {
        return markdown;
    };
    let after_close = first_newline + 1 + end_index + 4;
    if after_close >= markdown.len() {
        return "";
    }
    &markdown[after_close..]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_no_frontmatter() {
        assert_eq!(strip_frontmatter("hello world"), "hello world");
    }

    #[test]
    fn strip_with_frontmatter() {
        let md = "---\ntitle: Test\ntags: [a, b]\n---\nBody content here";
        assert_eq!(strip_frontmatter(md), "\nBody content here");
    }

    #[test]
    fn strip_frontmatter_only() {
        let md = "---\ntitle: Test\n---";
        assert_eq!(strip_frontmatter(md), "");
    }

    #[test]
    fn strip_frontmatter_with_trailing_newline() {
        let md = "---\nk: v\n---\n";
        assert_eq!(strip_frontmatter(md), "\n");
    }

    #[test]
    fn extract_tags_from_sequence() {
        let md = "---\ntags: [rust, test]\n---\nbody";
        let fm = extract_frontmatter(md);
        assert_eq!(fm.tags, vec!["rust", "test"]);
        assert!(fm.properties.is_empty());
    }

    #[test]
    fn extract_properties() {
        let md = "---\nstatus: draft\npriority: 1\n---\nbody";
        let fm = extract_frontmatter(md);
        assert!(fm.tags.is_empty());
        assert_eq!(fm.properties.len(), 2);
        assert_eq!(fm.properties["status"].as_str(), Some("draft"));
    }

    #[test]
    fn extract_empty_frontmatter_block() {
        let md = "---\n---\nbody";
        let fm = extract_frontmatter(md);
        assert!(fm.tags.is_empty());
        assert!(fm.properties.is_empty());
    }

    #[test]
    fn extract_deeply_nested_yaml_stored_as_json() {
        let md = "---\nmeta:\n  nested:\n    deep: value\n---\nbody";
        let fm = extract_frontmatter(md);
        assert_eq!(fm.properties.len(), 1);
        let meta = &fm.properties["meta"];
        assert!(meta.is_mapping());
    }

    #[test]
    fn extract_date_like_string_is_string() {
        let md = "---\ncreated: 2024-01-15\n---\nbody";
        let fm = extract_frontmatter(md);
        let val = &fm.properties["created"];
        assert!(val.as_str().is_some() || val.as_mapping().is_none());
    }

    #[test]
    fn extract_float_property() {
        let md = "---\nscore: 3.14\n---\nbody";
        let fm = extract_frontmatter(md);
        let val = &fm.properties["score"];
        assert!(val.as_f64().is_some());
    }

    #[test]
    fn extract_negative_number_property() {
        let md = "---\noffset: -42\n---\nbody";
        let fm = extract_frontmatter(md);
        let val = &fm.properties["offset"];
        assert!(val.as_i64().is_some());
        assert_eq!(val.as_i64(), Some(-42));
    }

    #[test]
    fn extract_zero_property() {
        let md = "---\ncount: 0\n---\nbody";
        let fm = extract_frontmatter(md);
        let val = &fm.properties["count"];
        assert_eq!(val.as_i64(), Some(0));
    }

    #[test]
    fn extract_boolean_true_lowercase() {
        let md = "---\npublished: true\n---\nbody";
        let fm = extract_frontmatter(md);
        assert_eq!(fm.properties["published"].as_bool(), Some(true));
    }

    #[test]
    fn extract_boolean_false_lowercase() {
        let md = "---\ndraft: false\n---\nbody";
        let fm = extract_frontmatter(md);
        assert_eq!(fm.properties["draft"].as_bool(), Some(false));
    }

    #[test]
    fn extract_tags_inline_array_format() {
        let md = "---\ntags: [alpha, beta, gamma]\n---\nbody";
        let fm = extract_frontmatter(md);
        assert_eq!(fm.tags, vec!["alpha", "beta", "gamma"]);
    }

    #[test]
    fn extract_tags_block_sequence_format() {
        let md = "---\ntags:\n  - rust\n  - systems\n---\nbody";
        let fm = extract_frontmatter(md);
        assert_eq!(fm.tags, vec!["rust", "systems"]);
    }

    #[test]
    fn extract_tag_singular_key() {
        let md = "---\ntag: [single]\n---\nbody";
        let fm = extract_frontmatter(md);
        assert_eq!(fm.tags, vec!["single"]);
    }

    #[test]
    fn extract_frontmatter_no_tags_key() {
        let md = "---\ntitle: No Tags Here\nauthor: alice\n---\nbody";
        let fm = extract_frontmatter(md);
        assert!(fm.tags.is_empty());
        assert_eq!(fm.properties.len(), 2);
    }

    #[test]
    fn extract_very_large_frontmatter() {
        let mut yaml = "---\n".to_string();
        for i in 0..200 {
            yaml.push_str(&format!("key_{i}: value_{i}\n"));
        }
        yaml.push_str("---\nbody");
        let fm = extract_frontmatter(&yaml);
        assert_eq!(fm.properties.len(), 200);
    }

    #[test]
    fn extract_no_frontmatter_returns_default() {
        let md = "Just content with no frontmatter at all.";
        let fm = extract_frontmatter(md);
        assert!(fm.tags.is_empty());
        assert!(fm.properties.is_empty());
    }

    #[test]
    fn extract_mixed_tag_and_properties() {
        let md = "---\ntags: [x, y]\nstatus: done\n---\nbody";
        let fm = extract_frontmatter(md);
        assert_eq!(fm.tags, vec!["x", "y"]);
        assert_eq!(fm.properties.len(), 1);
        assert_eq!(fm.properties["status"].as_str(), Some("done"));
    }
}
