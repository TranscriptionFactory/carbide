use crate::features::pipeline::service as pipeline;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::{Component, PathBuf};
use std::process::Stdio;
use tempfile::tempdir;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AiExecutionResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

impl From<pipeline::PipelineResult> for AiExecutionResult {
    fn from(res: pipeline::PipelineResult) -> Self {
        Self {
            success: res.success,
            output: res.output,
            error: res.error,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "kind")]
pub enum AiArgsTemplate {
    #[serde(rename = "claude")]
    Claude,
    #[serde(rename = "codex")]
    Codex,
    #[serde(rename = "ollama")]
    Ollama,
    #[serde(rename = "stdin")]
    Stdin,
    #[serde(rename = "args")]
    Args { args: Vec<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AiProviderConfig {
    pub id: String,
    pub name: String,
    pub command: String,
    pub args_template: AiArgsTemplate,
    pub model: Option<String>,
    pub install_url: Option<String>,
    pub is_preset: Option<bool>,
}

fn validate_note_path(vault_path: &str, note_path: &str) -> Result<(), String> {
    let vault_root = PathBuf::from(vault_path)
        .canonicalize()
        .map_err(|_| "Invalid vault path".to_string())?;
    let note_path_buf = PathBuf::from(note_path);

    if note_path_buf.is_absolute() {
        return Err("Note path must be relative to the vault".to_string());
    }

    for component in note_path_buf.components() {
        if matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        ) {
            return Err("Note path must stay inside the vault".to_string());
        }
    }

    let extension = note_path_buf
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if !extension.eq_ignore_ascii_case("md") && !extension.eq_ignore_ascii_case("markdown") {
        return Err("AI editing is only supported for markdown files".to_string());
    }

    let joined = vault_root.join(note_path_buf);
    if !joined.starts_with(&vault_root) {
        return Err("Note path must stay inside the vault".to_string());
    }

    Ok(())
}

async fn execute_ai_cli(
    _cli_name: &str,
    command: String,
    args: Vec<String>,
    stdin_input: Option<String>,
    current_dir: String,
    not_found_msg: String,
    timeout_seconds: Option<u64>,
    output_path: Option<PathBuf>,
) -> Result<AiExecutionResult, String> {
    let res =
        pipeline::execute_pipeline(command, args, stdin_input, current_dir, timeout_seconds, output_path)
            .await?;

    let mut ai_res: AiExecutionResult = res.into();
    if !ai_res.success && ai_res.error.as_deref().is_some_and(|e| e.contains("Command not found")) {
        ai_res.error = Some(not_found_msg);
    }
    Ok(ai_res)
}

fn ollama_model_name(model: &Option<String>) -> String {
    match model {
        Some(m) if !m.trim().is_empty() => m.trim().to_string(),
        _ => "qwen3:8b".to_string(),
    }
}

fn not_found_message(config: &AiProviderConfig) -> String {
    match &config.install_url {
        Some(url) => format!(
            "{} CLI not found. Please install it from {}",
            config.name, url
        ),
        None => format!(
            "{} CLI not found. Please ensure '{}' is installed and available in your PATH.",
            config.name, config.command
        ),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn ai_check_cli(command: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = pipeline::get_expanded_path();
        pipeline::check_cli_exists(&command, &path)
    })
    .await
    .map_err(|e| format!("Failed to check AI CLI: {}", e))?
}

#[tauri::command]
#[specta::specta]
pub async fn ai_execute_cli(
    provider_config: AiProviderConfig,
    vault_path: String,
    note_path: String,
    prompt: String,
    timeout_seconds: Option<u64>,
) -> Result<AiExecutionResult, String> {
    validate_note_path(&vault_path, &note_path)?;

    let command = provider_config.command.clone();
    let not_found = not_found_message(&provider_config);

    match provider_config.args_template {
        AiArgsTemplate::Claude => {
            execute_ai_cli(
                &provider_config.name,
                command,
                vec![
                    "-p".to_string(),
                    prompt,
                    "--output-format".to_string(),
                    "text".to_string(),
                ],
                None,
                vault_path,
                not_found,
                timeout_seconds,
                None,
            )
            .await
        }
        AiArgsTemplate::Codex => {
            let output_dir =
                tempdir().map_err(|e| format!("Failed to create Codex output directory: {}", e))?;
            let output_path = output_dir.path().join("codex-output.txt");

            execute_ai_cli(
                &provider_config.name,
                command,
                vec![
                    "exec".to_string(),
                    "--skip-git-repo-check".to_string(),
                    "--output-last-message".to_string(),
                    output_path.to_string_lossy().to_string(),
                    "-".to_string(),
                ],
                Some(prompt),
                vault_path,
                not_found,
                timeout_seconds,
                Some(output_path),
            )
            .await
        }
        AiArgsTemplate::Ollama => {
            let model_name = ollama_model_name(&provider_config.model);

            if !model_name.contains("cloud") {
                let model_to_check = model_name.clone();
                let command_to_check = command.clone();
                let available = tauri::async_runtime::spawn_blocking(move || {
                    let path = pipeline::get_expanded_path();
                    let mut cmd = pipeline::no_window_cmd(&command_to_check);
                    cmd.env("PATH", &path)
                        .args(["show", &model_to_check])
                        .stdout(Stdio::null())
                        .stderr(Stdio::null());
                    match cmd.status() {
                        Ok(status) => status.success(),
                        Err(_) => false,
                    }
                })
                .await
                .unwrap_or(false);

                if !available {
                    return Ok(AiExecutionResult {
                        success: false,
                        output: String::new(),
                        error: Some(format!(
                            "Model '{}' is not installed. Run: ollama pull {}",
                            model_name, model_name
                        )),
                    });
                }
            }

            let result = execute_ai_cli(
                &provider_config.name,
                command,
                vec!["run".to_string(), model_name.clone()],
                Some(prompt),
                vault_path,
                not_found,
                timeout_seconds,
                None,
            )
            .await?;

            if !result.success {
                if let Some(ref error) = result.error {
                    let error_lower = error.to_lowercase();
                    if error_lower.contains("model not found")
                        || error_lower.contains("model does not exist")
                        || error_lower.contains("pull model manifest")
                        || error_lower.contains("file does not exist")
                    {
                        return Ok(AiExecutionResult {
                            success: false,
                            output: String::new(),
                            error: Some(format!(
                                "Model '{}' not found. Run `ollama pull {}` in your terminal to download it.",
                                model_name, model_name
                            )),
                        });
                    }
                    if error.contains("401") || error.contains("Unauthorized") {
                        return Ok(AiExecutionResult {
                            success: false,
                            output: String::new(),
                            error: Some(
                                "Authentication required. Run `ollama login` in your terminal to sign in."
                                    .to_string(),
                            ),
                        });
                    }
                }
            }

            Ok(result)
        }
        AiArgsTemplate::Stdin => {
            execute_ai_cli(
                &provider_config.name,
                command,
                vec![],
                Some(prompt),
                vault_path,
                not_found,
                timeout_seconds,
                None,
            )
            .await
        }
        AiArgsTemplate::Args { args } => {
            let model = provider_config.model.as_deref().unwrap_or("");
            let final_args: Vec<String> = args
                .iter()
                .map(|a| a.replace("{prompt}", &prompt).replace("{model}", model))
                .collect();
            execute_ai_cli(
                &provider_config.name,
                command,
                final_args,
                None,
                vault_path,
                not_found,
                timeout_seconds,
                None,
            )
            .await
        }
    }
}
