use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::io::{Read, Write};
use std::path::{Component, PathBuf};
use std::process::{Child, Stdio};
use std::sync::{Arc, Mutex};
use tempfile::tempdir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiExecutionResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

fn get_expanded_path() -> String {
    let system_path = std::env::var_os("PATH").unwrap_or_else(|| OsString::from(""));
    let home = std::env::var("HOME").unwrap_or_else(|_| String::new());

    if home.is_empty() {
        return PathBuf::from(system_path).to_string_lossy().to_string();
    }

    let candidate_dirs = [
        format!("{home}/.nvm/versions/node"),
        format!("{home}/.fnm/node-versions"),
        format!("{home}/.local/share/mise/installs/node"),
    ];
    let static_dirs = [
        format!("{home}/.volta/bin"),
        format!("{home}/.local/bin"),
        "/usr/local/bin".to_string(),
        "/opt/homebrew/bin".to_string(),
    ];

    let mut expanded: Vec<PathBuf> = static_dirs.into_iter().map(PathBuf::from).collect();

    for base in candidate_dirs {
        if let Ok(entries) = std::fs::read_dir(base) {
            for entry in entries.flatten() {
                let bin_path = entry.path().join("bin");
                if bin_path.exists() {
                    expanded.push(bin_path);
                }
            }
        }
    }

    expanded.extend(std::env::split_paths(&system_path));

    std::env::join_paths(expanded)
        .unwrap_or(system_path)
        .to_string_lossy()
        .to_string()
}

fn no_window_cmd(program: &str) -> std::process::Command {
    let cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = cmd;
        cmd.creation_flags(0x08000000);
        cmd
    }
    #[cfg(not(target_os = "windows"))]
    {
        cmd
    }
}

fn check_cli_exists(command_name: &str, path: &str) -> Result<bool, String> {
    if command_name.contains(std::path::MAIN_SEPARATOR) || command_name.contains('/') {
        return Ok(PathBuf::from(command_name).exists());
    }

    let which_cmd = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };

    let output = no_window_cmd(which_cmd)
        .arg(command_name)
        .env("PATH", path)
        .output()
        .map_err(|e| format!("Failed to check for {} CLI: {}", command_name, e))?;

    Ok(output.status.success())
}

fn resolved_command(command: Option<String>, fallback: &str) -> String {
    let trimmed = command.unwrap_or_default().trim().to_string();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed
    }
}

fn resolved_timeout_seconds(timeout_seconds: Option<u64>) -> u64 {
    match timeout_seconds {
        Some(value) if value > 0 => value,
        _ => 300,
    }
}

fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch != '\u{1b}' {
            out.push(ch);
            continue;
        }

        match chars.peek().copied() {
            Some('[') => {
                let _ = chars.next();
                while let Some(next) = chars.next() {
                    if next.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
            Some(']') => {
                let _ = chars.next();
                while let Some(next) = chars.next() {
                    if next == '\u{7}' {
                        break;
                    }
                }
            }
            _ => {}
        }
    }

    out
}

fn read_stream_to_string<T: Read + Send + 'static>(
    mut handle: T,
) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let mut output = String::new();
        let _ = handle.read_to_string(&mut output);
        output
    })
}

fn clean_cli_output(input: &str) -> String {
    strip_ansi(input).trim().to_string()
}

fn resolve_cli_output(stdout_clean: &str, output_path: Option<&PathBuf>) -> String {
    let Some(path) = output_path else {
        return stdout_clean.to_string();
    };

    match std::fs::read_to_string(path) {
        Ok(file_output) => clean_cli_output(&file_output),
        Err(_) => stdout_clean.to_string(),
    }
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
    cli_name: &str,
    command: String,
    args: Vec<String>,
    stdin_input: Option<String>,
    current_dir: String,
    not_found_msg: String,
    timeout_seconds: Option<u64>,
    output_path: Option<PathBuf>,
) -> Result<AiExecutionResult, String> {
    let cli_name = cli_name.to_string();
    let timeout_duration =
        std::time::Duration::from_secs(resolved_timeout_seconds(timeout_seconds));
    let shared_child: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    let child_for_task = Arc::clone(&shared_child);
    let cli_name_task = cli_name.clone();

    let mut task = tauri::async_runtime::spawn_blocking(move || {
        let path = get_expanded_path();
        match check_cli_exists(&command, &path) {
            Ok(false) => {
                return AiExecutionResult {
                    success: false,
                    output: String::new(),
                    error: Some(not_found_msg),
                }
            }
            Err(e) => {
                return AiExecutionResult {
                    success: false,
                    output: String::new(),
                    error: Some(e),
                }
            }
            Ok(true) => {}
        }

        let mut cmd = no_window_cmd(&command);
        cmd.current_dir(&current_dir)
            .env("PATH", &path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for arg in &args {
            cmd.arg(arg);
        }

        let process = match cmd.spawn() {
            Ok(process) => process,
            Err(e) => {
                return AiExecutionResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Failed to execute {}: {}", cli_name_task, e)),
                }
            }
        };

        if let Ok(mut guard) = child_for_task.lock() {
            *guard = Some(process);
        } else {
            return AiExecutionResult {
                success: false,
                output: String::new(),
                error: Some(format!("Failed to lock {} process handle", cli_name_task)),
            };
        }

        if let Some(stdin_input) = stdin_input {
            let stdin_handle = child_for_task
                .lock()
                .ok()
                .and_then(|mut guard| guard.as_mut().and_then(|process| process.stdin.take()));

            if let Some(mut stdin) = stdin_handle {
                if let Err(e) = stdin.write_all(stdin_input.as_bytes()) {
                    if let Ok(mut guard) = child_for_task.lock() {
                        if let Some(ref mut process) = *guard {
                            let _ = process.kill();
                            let _ = process.wait();
                        }
                    }
                    return AiExecutionResult {
                        success: false,
                        output: String::new(),
                        error: Some(format!("Failed to write to {} stdin: {}", cli_name_task, e)),
                    };
                }
            } else {
                if let Ok(mut guard) = child_for_task.lock() {
                    if let Some(ref mut process) = *guard {
                        let _ = process.kill();
                        let _ = process.wait();
                    }
                }
                return AiExecutionResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Failed to open stdin for {}", cli_name_task)),
                };
            }
        }

        let stdout_handle = child_for_task
            .lock()
            .ok()
            .and_then(|mut guard| guard.as_mut().and_then(|process| process.stdout.take()));
        let stderr_handle = child_for_task
            .lock()
            .ok()
            .and_then(|mut guard| guard.as_mut().and_then(|process| process.stderr.take()));

        let stdout_reader = stdout_handle.map(read_stream_to_string);
        let stderr_reader = stderr_handle.map(read_stream_to_string);

        let success = child_for_task
            .lock()
            .ok()
            .and_then(|mut guard| guard.as_mut().and_then(|process| process.wait().ok()))
            .map(|status| status.success())
            .unwrap_or(false);

        let stdout = stdout_reader
            .and_then(|reader| reader.join().ok())
            .unwrap_or_default();
        let stderr = stderr_reader
            .and_then(|reader| reader.join().ok())
            .unwrap_or_default();

        let stdout_clean = clean_cli_output(&stdout);
        let stderr_clean = clean_cli_output(&stderr);
        let output = if success {
            resolve_cli_output(&stdout_clean, output_path.as_ref())
        } else {
            stdout_clean.clone()
        };

        if success {
            AiExecutionResult {
                success: true,
                output,
                error: None,
            }
        } else {
            AiExecutionResult {
                success: false,
                output: stdout_clean,
                error: Some(stderr_clean),
            }
        }
    });

    let result = match tokio::time::timeout(timeout_duration, &mut task).await {
        Ok(join_result) => {
            join_result.map_err(|e| format!("Failed to join {} blocking task: {}", cli_name, e))?
        }
        Err(_) => {
            if let Ok(mut guard) = shared_child.lock() {
                if let Some(ref mut process) = *guard {
                    let _ = process.kill();
                }
            }

            match tokio::time::timeout(std::time::Duration::from_secs(5), task).await {
                Ok(join_result) => {
                    if let Err(e) = join_result {
                        return Err(format!(
                            "Failed to join {} blocking task after timeout: {}",
                            cli_name, e
                        ));
                    }
                }
                Err(_) => {
                    return Err(format!(
                        "{} CLI timed out and failed to exit after kill signal",
                        cli_name
                    ));
                }
            }

            AiExecutionResult {
                success: false,
                output: String::new(),
                error: Some(format!("{} CLI timed out after 5 minutes", cli_name)),
            }
        }
    };

    Ok(result)
}

fn codex_args(output_path: &str) -> Vec<String> {
    vec![
        "exec".to_string(),
        "--skip-git-repo-check".to_string(),
        "--output-last-message".to_string(),
        output_path.to_string(),
        "-".to_string(),
    ]
}

fn ollama_model_name(model: &str) -> String {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        "qwen3:8b".to_string()
    } else {
        trimmed.to_string()
    }
}

#[tauri::command]
pub async fn ai_check_cli(provider: String, command: Option<String>) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = get_expanded_path();
        let default_command = match provider.as_str() {
            "claude" => "claude",
            "codex" => "codex",
            "ollama" => "ollama",
            _ => return Err(format!("Unsupported AI provider: {}", provider)),
        };
        let command = resolved_command(command, default_command);
        check_cli_exists(&command, &path)
    })
    .await
    .map_err(|e| format!("Failed to check AI CLI: {}", e))?
}

#[tauri::command]
pub async fn ai_execute_claude(
    vault_path: String,
    note_path: String,
    prompt: String,
    command: Option<String>,
    timeout_seconds: Option<u64>,
) -> Result<AiExecutionResult, String> {
    validate_note_path(&vault_path, &note_path)?;
    let command = resolved_command(command, "claude");

    execute_ai_cli(
        "Claude",
        command,
        vec![
            "-p".to_string(),
            prompt,
            "--output-format".to_string(),
            "text".to_string(),
        ],
        None,
        vault_path,
        "Claude CLI not found. Please install it from https://code.claude.com/docs/en/quickstart"
            .to_string(),
        timeout_seconds,
        None,
    )
    .await
}

#[tauri::command]
pub async fn ai_execute_codex(
    vault_path: String,
    note_path: String,
    prompt: String,
    command: Option<String>,
    timeout_seconds: Option<u64>,
) -> Result<AiExecutionResult, String> {
    validate_note_path(&vault_path, &note_path)?;
    let command = resolved_command(command, "codex");
    let _output_dir =
        tempdir().map_err(|e| format!("Failed to create Codex output directory: {}", e))?;
    let output_path = _output_dir.path().join("codex-output.txt");

    execute_ai_cli(
        "Codex",
        command,
        codex_args(&output_path.to_string_lossy()),
        Some(prompt),
        vault_path,
        "Codex CLI not found. Please install it from https://github.com/openai/codex".to_string(),
        timeout_seconds,
        Some(output_path),
    )
    .await
}

#[tauri::command]
pub async fn ai_execute_ollama(
    vault_path: String,
    note_path: String,
    prompt: String,
    command: Option<String>,
    model: Option<String>,
    timeout_seconds: Option<u64>,
) -> Result<AiExecutionResult, String> {
    validate_note_path(&vault_path, &note_path)?;

    let model_name = ollama_model_name(model.as_deref().unwrap_or(""));
    let command = resolved_command(command, "ollama");

    if !model_name.contains("cloud") {
        let model_to_check = model_name.clone();
        let command_to_check = command.clone();
        let available = tauri::async_runtime::spawn_blocking(move || {
            let path = get_expanded_path();
            let mut cmd = no_window_cmd(&command_to_check);
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
        "Ollama",
        command,
        vec!["run".to_string(), model_name.clone()],
        Some(prompt),
        vault_path,
        "Ollama CLI not found. Please install it from https://ollama.com".to_string(),
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

#[cfg(test)]
mod tests {
    use super::{codex_args, no_window_cmd, read_stream_to_string, resolve_cli_output, strip_ansi};
    use std::process::Stdio;
    use tempfile::tempdir;

    #[test]
    fn strips_basic_ansi_sequences() {
        let input = "\u{1b}[31merror\u{1b}[0m plain";
        assert_eq!(strip_ansi(input), "error plain");
    }

    #[test]
    fn strips_osc_sequences() {
        let input = "before\u{1b}]0;title\u{7}after";
        assert_eq!(strip_ansi(input), "beforeafter");
    }

    #[test]
    fn reads_stdout_and_stderr_concurrently() {
        let mut child = no_window_cmd("/bin/sh");
        child
            .arg("-c")
            .arg(
                r#"python3 -c "import sys; sys.stdout.write('o'*200000); sys.stdout.flush(); sys.stderr.write('e'*200000); sys.stderr.flush()""#,
            )
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut process = child.spawn().expect("spawn child");
        let stdout_reader =
            read_stream_to_string(process.stdout.take().expect("stdout pipe available"));
        let stderr_reader =
            read_stream_to_string(process.stderr.take().expect("stderr pipe available"));

        let status = process.wait().expect("wait for child");
        let stdout = stdout_reader.join().expect("join stdout reader");
        let stderr = stderr_reader.join().expect("join stderr reader");

        assert!(status.success());
        assert_eq!(stdout.len(), 200000);
        assert_eq!(stderr.len(), 200000);
    }

    #[test]
    fn prefers_captured_output_file_when_present() {
        let dir = tempdir().expect("temp dir should be created");
        let output_path = dir.path().join("codex-output.txt");
        std::fs::write(&output_path, "First line\nSecond line\n")
            .expect("output file should be written");

        assert_eq!(
            resolve_cli_output("fallback", Some(&output_path)),
            "First line\nSecond line"
        );
    }

    #[test]
    fn falls_back_to_stdout_when_output_file_is_missing() {
        let dir = tempdir().expect("temp dir should be created");
        let output_path = dir.path().join("missing-codex-output.txt");

        assert_eq!(
            resolve_cli_output("fallback", Some(&output_path)),
            "fallback"
        );
    }

    #[test]
    fn codex_args_capture_only_the_last_message() {
        assert_eq!(
            codex_args("/tmp/codex-output.txt"),
            vec![
                "exec".to_string(),
                "--skip-git-repo-check".to_string(),
                "--output-last-message".to_string(),
                "/tmp/codex-output.txt".to_string(),
                "-".to_string(),
            ]
        );
    }
}
