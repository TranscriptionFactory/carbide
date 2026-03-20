use crate::features::pipeline::service as pipeline;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::{Component, PathBuf};
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
pub enum AiTransport {
    #[serde(rename = "cli")]
    Cli { command: String, args: Vec<String> },
    #[serde(rename = "api")]
    Api {
        base_url: String,
        api_key_env: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AiProviderConfig {
    pub id: String,
    pub name: String,
    pub transport: AiTransport,
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

fn not_found_message(config: &AiProviderConfig, command: &str) -> String {
    match &config.install_url {
        Some(url) => format!(
            "{} CLI not found. Please install it from {}",
            config.name, url
        ),
        None => format!(
            "{} CLI not found. Please ensure '{}' is installed and available in your PATH.",
            config.name, command
        ),
    }
}

fn substitute_args(
    args: &[String],
    prompt: &str,
    model: &str,
    output_file: Option<&str>,
) -> Vec<String> {
    args.iter()
        .map(|a| {
            let mut s = a.replace("{model}", model);
            s = s.replace("{prompt}", prompt);
            if let Some(path) = output_file {
                s = s.replace("{output_file}", path);
            }
            s
        })
        .collect()
}

fn args_contain(args: &[String], placeholder: &str) -> bool {
    args.iter().any(|a| a.contains(placeholder))
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

    match &provider_config.transport {
        AiTransport::Cli { command, args } => {
            let model = provider_config.model.as_deref().unwrap_or("");
            let not_found = not_found_message(&provider_config, command);

            let has_output_file = args_contain(args, "{output_file}");
            let prompt_via_stdin = !args_contain(args, "{prompt}");

            let output_dir = if has_output_file {
                Some(tempdir().map_err(|e| format!("Failed to create output directory: {}", e))?)
            } else {
                None
            };
            let output_path = output_dir.as_ref().map(|d| d.path().join("ai-output.txt"));
            let output_file_str = output_path
                .as_ref()
                .map(|p| p.to_string_lossy().to_string());

            let final_args = substitute_args(args, &prompt, model, output_file_str.as_deref());

            let stdin_input = if prompt_via_stdin {
                Some(prompt.clone())
            } else {
                None
            };

            let res = pipeline::execute_pipeline(
                command.clone(),
                final_args,
                stdin_input,
                vault_path,
                timeout_seconds,
                output_path,
            )
            .await?;

            let mut ai_res: AiExecutionResult = res.into();
            if !ai_res.success {
                if let Some(ref e) = ai_res.error {
                    if e.contains("Command not found") {
                        ai_res.error = Some(not_found);
                    }
                }
            }

            Ok(ai_res)
        }
        AiTransport::Api { .. } => Err("API-based providers are not yet supported".to_string()),
    }
}
