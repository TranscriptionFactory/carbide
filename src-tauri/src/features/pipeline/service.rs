use serde::{Deserialize, Serialize};
use specta::Type;
use std::ffi::OsString;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Child, Stdio};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PipelineResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

pub fn get_expanded_path() -> String {
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

pub fn no_window_cmd(program: &str) -> std::process::Command {
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

pub fn check_cli_exists(command_name: &str, path: &str) -> Result<bool, String> {
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

pub fn strip_ansi(input: &str) -> String {
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

pub fn read_stream_to_string<T: Read + Send + 'static>(
    mut handle: T,
) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let mut output = String::new();
        let _ = handle.read_to_string(&mut output);
        output
    })
}

pub fn resolve_carriage_returns(input: &str) -> String {
    input
        .lines()
        .map(|line| {
            if let Some(pos) = line.rfind('\r') {
                &line[pos + 1..]
            } else {
                line
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn clean_cli_output(input: &str) -> String {
    let cleaned = strip_ansi(input);
    resolve_carriage_returns(&cleaned).trim().to_string()
}

pub fn resolve_cli_output(stdout_clean: &str, output_path: Option<&PathBuf>) -> String {
    let Some(path) = output_path else {
        return stdout_clean.to_string();
    };

    match std::fs::read_to_string(path) {
        Ok(file_output) => clean_cli_output(&file_output),
        Err(_) => stdout_clean.to_string(),
    }
}

pub async fn execute_pipeline(
    command: String,
    args: Vec<String>,
    stdin_input: Option<String>,
    current_dir: String,
    timeout_seconds: Option<u64>,
    output_path: Option<PathBuf>,
) -> Result<PipelineResult, String> {
    let timeout_duration = std::time::Duration::from_secs(timeout_seconds.unwrap_or(300));
    let shared_child: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    let child_for_task = Arc::clone(&shared_child);

    let mut task = tauri::async_runtime::spawn_blocking(move || {
        let path = get_expanded_path();
        match check_cli_exists(&command, &path) {
            Ok(false) => {
                return PipelineResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Command not found: {}", command)),
                }
            }
            Err(e) => {
                return PipelineResult {
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
                return PipelineResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Failed to execute {}: {}", command, e)),
                }
            }
        };

        if let Ok(mut guard) = child_for_task.lock() {
            *guard = Some(process);
        }

        if let Some(stdin_input) = stdin_input {
            let stdin_handle = child_for_task
                .lock()
                .ok()
                .and_then(|mut guard| guard.as_mut().and_then(|process| process.stdin.take()));

            if let Some(mut stdin) = stdin_handle {
                if let Err(e) = stdin.write_all(stdin_input.as_bytes()) {
                    let _ = child_for_task
                        .lock()
                        .map(|mut g| g.as_mut().map(|p| p.kill()));
                    return PipelineResult {
                        success: false,
                        output: String::new(),
                        error: Some(format!("Failed to write to stdin: {}", e)),
                    };
                }
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
            PipelineResult {
                success: true,
                output,
                error: None,
            }
        } else {
            PipelineResult {
                success: false,
                output: stdout_clean,
                error: Some(stderr_clean),
            }
        }
    });

    let result = match tokio::time::timeout(timeout_duration, &mut task).await {
        Ok(join_result) => {
            join_result.map_err(|e| format!("Failed to join pipeline task: {}", e))?
        }
        Err(_) => {
            if let Ok(mut guard) = shared_child.lock() {
                if let Some(ref mut process) = *guard {
                    let _ = process.kill();
                }
            }
            PipelineResult {
                success: false,
                output: String::new(),
                error: Some("Pipeline timed out".to_string()),
            }
        }
    };

    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub async fn pipeline_execute(
    command: String,
    args: Vec<String>,
    stdin_input: Option<String>,
    current_dir: String,
    timeout_seconds: Option<u64>,
) -> Result<PipelineResult, String> {
    execute_pipeline(
        command,
        args,
        stdin_input,
        current_dir,
        timeout_seconds,
        None,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_carriage_returns_strips_spinner_lines() {
        let input = "Loading model ⠙\rLoading model ⠹\rLoading model ⠸\rActual output";
        assert_eq!(resolve_carriage_returns(input), "Actual output");
    }

    #[test]
    fn resolve_carriage_returns_preserves_multiline_output() {
        let input = "line one\nline two\nline three";
        assert_eq!(resolve_carriage_returns(input), "line one\nline two\nline three");
    }

    #[test]
    fn resolve_carriage_returns_handles_mixed() {
        let input = "Spinner ⠙\rSpinner ⠹\rDone loading\nsecond line";
        assert_eq!(resolve_carriage_returns(input), "Done loading\nsecond line");
    }

    #[test]
    fn clean_cli_output_strips_spinner_and_ansi() {
        let input = "\u{1b}[32mLoading model ⠙\rLoading model ⠸\rHello world\u{1b}[0m\n";
        assert_eq!(clean_cli_output(input), "Hello world");
    }

    #[test]
    fn clean_cli_output_no_cr_unchanged() {
        assert_eq!(clean_cli_output("  hello world  "), "hello world");
    }
}
