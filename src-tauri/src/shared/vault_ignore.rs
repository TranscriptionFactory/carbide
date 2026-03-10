use crate::features::vault_settings::service::get_vault_setting_value;
use crate::shared::storage;
use glob::Pattern;
use serde_json::Value;
use std::path::Path;

const VAULT_IGNORE_FILE: &str = ".vaultignore";
const GIT_IGNORE_FILE: &str = ".gitignore";
const BUILTIN_PATTERNS: &[&str] = &[
    ".git/",
    ".otterly/",
    ".DS_Store",
    "node_modules/",
];

#[derive(Clone, Debug)]
struct IgnoreRule {
    include: bool,
    dir_only: bool,
    patterns: Vec<Pattern>,
}

impl IgnoreRule {
    fn matches_path(&self, value: &str) -> bool {
        self.patterns.iter().any(|pattern| pattern.matches(value))
    }
}

#[derive(Clone, Debug, Default)]
pub struct VaultIgnoreMatcher {
    rules: Vec<IgnoreRule>,
    cache_token: String,
}

impl VaultIgnoreMatcher {
    pub fn cache_token(&self) -> &str {
        &self.cache_token
    }

    pub fn is_ignored(&self, root: &Path, path: &Path, is_dir: bool) -> bool {
        let Ok(relative) = path.strip_prefix(root) else {
            return false;
        };
        let relative = storage::normalize_relative_path(relative);
        self.is_ignored_relative(&relative, is_dir)
    }

    pub fn is_ignored_relative(&self, relative_path: &str, is_dir: bool) -> bool {
        let relative_path = normalize_relative_path(relative_path);
        if relative_path.is_empty() {
            return false;
        }

        let directory_candidates = collect_directory_candidates(&relative_path, is_dir);
        let mut ignored = false;

        for rule in &self.rules {
            let matched = if rule.dir_only {
                directory_candidates
                    .iter()
                    .any(|candidate| rule.matches_path(candidate))
            } else {
                rule.matches_path(&relative_path)
            };

            if matched {
                ignored = !rule.include;
            }
        }

        ignored
    }
}

pub fn load_vault_ignore_matcher(
    app: &tauri::AppHandle,
    vault_id: &str,
    root: &Path,
) -> Result<VaultIgnoreMatcher, String> {
    let mut builder = RuleBuilder::default();

    for pattern in BUILTIN_PATTERNS {
        builder.add_pattern(pattern)?;
    }

    for line in read_ignore_lines(&root.join(GIT_IGNORE_FILE))? {
        builder.add_pattern(&line)?;
    }

    for line in read_ignore_lines(&root.join(VAULT_IGNORE_FILE))? {
        builder.add_pattern(&line)?;
    }

    for folder in load_setting_ignored_folders(app, vault_id)? {
        builder.add_pattern(&format!("{}/", normalize_relative_path(&folder)))?;
    }

    Ok(builder.build())
}

fn read_ignore_lines(path: &Path) -> Result<Vec<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(content) => Ok(content.lines().map(str::to_string).collect()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error.to_string()),
    }
}

fn load_setting_ignored_folders(
    app: &tauri::AppHandle,
    vault_id: &str,
) -> Result<Vec<String>, String> {
    let Some(Value::Object(editor)) = get_vault_setting_value(app, vault_id, "editor")? else {
        return Ok(Vec::new());
    };

    let Some(Value::Array(values)) = editor.get("ignored_folders") else {
        return Ok(Vec::new());
    };

    Ok(values
        .iter()
        .filter_map(Value::as_str)
        .map(normalize_relative_path)
        .filter(|value| !value.is_empty())
        .collect())
}

#[derive(Default)]
struct RuleBuilder {
    rules: Vec<IgnoreRule>,
    token_parts: Vec<String>,
}

impl RuleBuilder {
    fn add_pattern(&mut self, raw_line: &str) -> Result<(), String> {
        let Some(parsed) = parse_rule(raw_line)? else {
            return Ok(());
        };

        self.token_parts.push(raw_line.trim().to_string());
        self.rules.push(parsed);
        Ok(())
    }

    fn build(self) -> VaultIgnoreMatcher {
        VaultIgnoreMatcher {
            rules: self.rules,
            cache_token: self.token_parts.join("\u{1f}"),
        }
    }
}

fn parse_rule(raw_line: &str) -> Result<Option<IgnoreRule>, String> {
    let trimmed = raw_line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
        return Ok(None);
    }

    let (include, body) = if let Some(rest) = trimmed.strip_prefix('!') {
        (true, rest.trim())
    } else {
        (false, trimmed)
    };

    if body.is_empty() {
        return Ok(None);
    }

    let dir_only = body.ends_with('/');
    let anchored = body.starts_with('/');
    let normalized = normalize_relative_path(body.trim_matches('/'));
    if normalized.is_empty() {
        return Ok(None);
    }

    let patterns = build_rule_patterns(&normalized, anchored)?;

    Ok(Some(IgnoreRule {
        include,
        dir_only,
        patterns,
    }))
}

fn build_rule_patterns(pattern: &str, anchored: bool) -> Result<Vec<Pattern>, String> {
    let has_slash = pattern.contains('/');
    let variants = if anchored {
        vec![pattern.to_string()]
    } else if has_slash {
        vec![pattern.to_string(), format!("**/{pattern}")]
    } else {
        vec![pattern.to_string(), format!("**/{pattern}")]
    };

    let mut compiled = Vec::with_capacity(variants.len());
    for variant in variants {
        compiled.push(Pattern::new(&variant).map_err(|error| error.to_string())?);
    }
    Ok(compiled)
}

fn normalize_relative_path(value: &str) -> String {
    value
        .trim()
        .replace('\\', "/")
        .trim_matches('/')
        .to_string()
}

fn collect_directory_candidates(relative_path: &str, is_dir: bool) -> Vec<String> {
    let parts: Vec<&str> = relative_path.split('/').filter(|part| !part.is_empty()).collect();
    let upto = if is_dir {
        parts.len()
    } else {
        parts.len().saturating_sub(1)
    };

    let mut candidates = Vec::with_capacity(upto);
    for index in 0..upto {
        candidates.push(parts[..=index].join("/"));
    }
    candidates
}

#[cfg(test)]
mod tests {
    use super::{parse_rule, VaultIgnoreMatcher};

    fn matcher(lines: &[&str]) -> VaultIgnoreMatcher {
        let mut rules = Vec::new();
        for line in lines {
            if let Some(rule) = parse_rule(line).expect("rule should parse") {
                rules.push(rule);
            }
        }
        VaultIgnoreMatcher {
            rules,
            cache_token: String::new(),
        }
    }

    #[test]
    fn ignores_nested_directory_patterns() {
        let matcher = matcher(&["node_modules/"]);

        assert!(matcher.is_ignored_relative("node_modules/pkg/index.js", false));
        assert!(matcher.is_ignored_relative("src/node_modules/pkg/index.js", false));
        assert!(matcher.is_ignored_relative("src/node_modules", true));
    }

    #[test]
    fn ignores_common_glob_patterns() {
        let matcher = matcher(&["*.tmp", "build/*.pdf"]);

        assert!(matcher.is_ignored_relative("cache.tmp", false));
        assert!(matcher.is_ignored_relative("nested/cache.tmp", false));
        assert!(matcher.is_ignored_relative("build/report.pdf", false));
        assert!(matcher.is_ignored_relative("docs/build/report.pdf", false));
        assert!(!matcher.is_ignored_relative("build/report.md", false));
    }

    #[test]
    fn supports_reinclude_rules() {
        let matcher = matcher(&["*.pdf", "!docs/keep.pdf"]);

        assert!(matcher.is_ignored_relative("docs/skip.pdf", false));
        assert!(!matcher.is_ignored_relative("docs/keep.pdf", false));
    }
}
