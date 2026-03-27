use super::types::*;
use std::path::{Path, PathBuf};

pub async fn check_vault(
    binary: &Path,
    vault_path: &Path,
) -> Result<Vec<FileDiagnostics>, anyhow::Error> {
    let config = super::config::config_path(vault_path);
    let mut cmd = tokio::process::Command::new(binary);
    cmd.args(["check", ".", "--format", "json"]);
    if config.exists() {
        cmd.args(["--config", &config.to_string_lossy()]);
    }
    let output = cmd.current_dir(vault_path).output().await?;

    if output.stdout.is_empty() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_check_output(&stdout, vault_path)
}

pub async fn format_file_with_rumdl(
    binary: &Path,
    vault_path: &Path,
    content: &str,
) -> Result<String, anyhow::Error> {
    let config = super::config::config_path(vault_path);
    let tmp_path = PathBuf::from(format!("/tmp/carbide_fmt_{}.md", std::process::id()));

    tokio::fs::write(&tmp_path, content).await?;

    let mut cmd = tokio::process::Command::new(binary);
    cmd.args(["fmt", tmp_path.to_str().unwrap_or("")]);
    if config.exists() {
        cmd.args(["--config", &config.to_string_lossy()]);
    }
    let output = cmd.current_dir(vault_path).output().await;

    let formatted = tokio::fs::read_to_string(&tmp_path).await;
    let _ = tokio::fs::remove_file(&tmp_path).await;

    output?;
    Ok(formatted?)
}

pub async fn format_file_with_prettier(
    vault_path: &Path,
    content: &str,
) -> Result<String, anyhow::Error> {
    let tmp_path = PathBuf::from(format!("/tmp/carbide_fmt_{}.md", std::process::id()));
    tokio::fs::write(&tmp_path, content).await?;

    let output = tokio::process::Command::new("npx")
        .args([
            "prettier",
            "--write",
            "--parser",
            "markdown",
            tmp_path.to_str().unwrap_or(""),
        ])
        .current_dir(vault_path)
        .output()
        .await;

    let formatted = tokio::fs::read_to_string(&tmp_path).await;
    let _ = tokio::fs::remove_file(&tmp_path).await;

    let output = output?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("prettier failed: {}", stderr));
    }
    Ok(formatted?)
}

pub async fn format_file_content(
    binary: &Path,
    vault_path: &Path,
    content: &str,
    formatter: &str,
) -> Result<String, anyhow::Error> {
    match formatter {
        "prettier" => format_file_with_prettier(vault_path, content).await,
        _ => format_file_with_rumdl(binary, vault_path, content).await,
    }
}

pub async fn format_vault(binary: &Path, vault_path: &Path) -> Result<Vec<String>, anyhow::Error> {
    let config = super::config::config_path(vault_path);
    let mut cmd = tokio::process::Command::new(binary);
    cmd.args(["fmt", "."]);
    if config.exists() {
        cmd.args(["--config", &config.to_string_lossy()]);
    }
    let output = cmd.current_dir(vault_path).output().await?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let files: Vec<String> = stdout
        .lines()
        .chain(stderr.lines())
        .filter(|line| !line.is_empty() && !line.starts_with("error"))
        .filter_map(|line| {
            line.strip_prefix("Formatted: ")
                .or_else(|| line.strip_prefix("formatted "))
                .map(|p| p.trim().to_string())
                .or_else(|| {
                    if line.ends_with(".md") {
                        Some(line.trim().to_string())
                    } else {
                        None
                    }
                })
        })
        .collect();

    Ok(files)
}

fn parse_check_output(
    stdout: &str,
    _vault_path: &Path,
) -> Result<Vec<FileDiagnostics>, anyhow::Error> {
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(stdout) {
        return parse_json_output(&parsed);
    }

    let mut file_map: std::collections::HashMap<String, Vec<LintDiagnostic>> =
        std::collections::HashMap::new();

    for line in stdout.lines() {
        if let Some(diag) = parse_check_line(line) {
            file_map.entry(diag.0).or_default().push(diag.1);
        }
    }

    Ok(file_map
        .into_iter()
        .map(|(path, diagnostics)| FileDiagnostics { path, diagnostics })
        .collect())
}

fn parse_json_output(value: &serde_json::Value) -> Result<Vec<FileDiagnostics>, anyhow::Error> {
    if let Some(files) = value.as_array() {
        let result: Vec<FileDiagnostics> = files
            .iter()
            .filter_map(|f| {
                let path = f["path"].as_str()?.to_string();
                let diagnostics: Vec<LintDiagnostic> = f["diagnostics"]
                    .as_array()?
                    .iter()
                    .filter_map(|d| {
                        Some(LintDiagnostic {
                            line: d["line"].as_u64()? as u32,
                            column: d["column"].as_u64().unwrap_or(1) as u32,
                            end_line: d["end_line"].as_u64().unwrap_or(d["line"].as_u64()?) as u32,
                            end_column: d["end_column"].as_u64().unwrap_or(1) as u32,
                            severity: match d["severity"].as_str() {
                                Some("error") => LintSeverity::Error,
                                Some("warning") => LintSeverity::Warning,
                                Some("info") => LintSeverity::Info,
                                _ => LintSeverity::Warning,
                            },
                            message: d["message"].as_str()?.to_string(),
                            rule_id: d["rule"].as_str().map(String::from),
                            fixable: d["fixable"].as_bool().unwrap_or(false),
                        })
                    })
                    .collect();
                Some(FileDiagnostics { path, diagnostics })
            })
            .collect();
        return Ok(result);
    }
    Ok(Vec::new())
}

fn parse_check_line(line: &str) -> Option<(String, LintDiagnostic)> {
    let parts: Vec<&str> = line.splitn(4, ':').collect();
    if parts.len() < 3 {
        return None;
    }

    let path = parts[0].trim().to_string();
    let line_num = parts[1].trim().parse::<u32>().ok()?;

    let (column, rest) = if parts.len() == 4 {
        let col = parts[2].trim().parse::<u32>().unwrap_or(1);
        (col, parts[3].trim())
    } else {
        (1, parts[2].trim())
    };

    let (rule_id, message) = if rest.starts_with("MD") || rest.starts_with("md") {
        let mut split = rest.splitn(2, ' ');
        let rule = split.next().unwrap_or("").to_string();
        let msg = split.next().unwrap_or("").to_string();
        (Some(rule), msg)
    } else {
        (None, rest.to_string())
    };

    Some((
        path,
        LintDiagnostic {
            line: line_num,
            column,
            end_line: line_num,
            end_column: column,
            severity: LintSeverity::Warning,
            message,
            rule_id,
            fixable: false,
        },
    ))
}
