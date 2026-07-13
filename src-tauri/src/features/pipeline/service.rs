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
        format!("{home}/.claude/local"),
        format!("{home}/.npm-global/bin"),
        format!("{home}/.npm/bin"),
        format!("{home}/.asdf/shims"),
        "/usr/local/bin".to_string(),
        "/opt/homebrew/bin".to_string(),
        "/home/linuxbrew/.linuxbrew/bin".to_string(),
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
    Ok(resolve_cli_with_path(command_name, path).status != CliProbeStatus::Missing)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum CliProbeStatus {
    Present,
    Missing,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CliProbe {
    pub status: CliProbeStatus,
    pub resolved_path: Option<String>,
    pub version: Option<String>,
    pub error: Option<String>,
}

impl CliProbe {
    fn present(path: PathBuf) -> Self {
        Self {
            status: CliProbeStatus::Present,
            resolved_path: Some(path.to_string_lossy().to_string()),
            version: None,
            error: None,
        }
    }

    fn missing(error: Option<String>) -> Self {
        Self {
            status: CliProbeStatus::Missing,
            resolved_path: None,
            version: None,
            error,
        }
    }

    #[cfg(unix)]
    fn unknown(error: Option<String>) -> Self {
        Self {
            status: CliProbeStatus::Unknown,
            resolved_path: None,
            version: None,
            error,
        }
    }
}

fn expand_tilde(command: &str) -> String {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok();
    expand_tilde_with_home(command, home.as_deref())
}

fn expand_tilde_with_home(command: &str, home: Option<&str>) -> String {
    let Some(rest) = command.strip_prefix("~/") else {
        return command.to_string();
    };
    match home {
        Some(home) if !home.is_empty() => format!("{home}/{rest}"),
        _ => command.to_string(),
    }
}

#[cfg(unix)]
fn is_executable(path: &std::path::Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path)
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(windows)]
fn is_executable(path: &std::path::Path) -> bool {
    std::fs::metadata(path).map(|m| m.is_file()).unwrap_or(false)
}

fn scan_path_dirs(command: &str, path: &str) -> Option<PathBuf> {
    for dir in std::env::split_paths(path) {
        if dir.as_os_str().is_empty() {
            continue;
        }
        let candidate = dir.join(command);
        if is_executable(&candidate) {
            return Some(candidate);
        }
        #[cfg(windows)]
        for ext in ["exe", "cmd", "bat"] {
            let with_ext = dir.join(format!("{command}.{ext}"));
            if is_executable(&with_ext) {
                return Some(with_ext);
            }
        }
    }
    None
}

fn wait_with_timeout(
    child: &mut Child,
    timeout: std::time::Duration,
) -> Option<std::process::ExitStatus> {
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Some(status),
            Ok(None) if start.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(50)),
            Err(_) => return None,
        }
    }
}

#[cfg(unix)]
enum ShellLookup {
    Found(PathBuf),
    NotFound,
    Failed,
}

#[cfg(unix)]
fn login_shell_lookup(command: &str) -> ShellLookup {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let quoted = format!("'{}'", command.replace('\'', "'\\''"));
    let spawned = no_window_cmd(&shell)
        .arg("-lc")
        .arg(format!("command -v {quoted}"))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn();
    let Ok(mut child) = spawned else {
        return ShellLookup::Failed;
    };
    let reader = child.stdout.take().map(read_stream_to_string);
    let Some(status) = wait_with_timeout(&mut child, std::time::Duration::from_secs(5)) else {
        return ShellLookup::Failed;
    };
    if !status.success() {
        return ShellLookup::NotFound;
    }
    let output = reader.and_then(|r| r.join().ok()).unwrap_or_default();
    for line in output.lines() {
        let candidate = PathBuf::from(line.trim());
        if candidate.is_absolute() && is_executable(&candidate) {
            return ShellLookup::Found(candidate);
        }
    }
    ShellLookup::Failed
}

pub fn resolve_cli(command: &str) -> CliProbe {
    resolve_cli_with_path(command, &get_expanded_path())
}

pub fn resolve_cli_with_path(command: &str, path: &str) -> CliProbe {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return CliProbe::missing(Some("No command configured".to_string()));
    }
    let expanded = expand_tilde(trimmed);

    if expanded.contains('/') || expanded.contains(std::path::MAIN_SEPARATOR) {
        let candidate = PathBuf::from(&expanded);
        if is_executable(&candidate) {
            return CliProbe::present(candidate);
        }
        if candidate.exists() {
            return CliProbe::missing(Some(format!("{expanded} found but not executable")));
        }
        return CliProbe::missing(Some(format!("{expanded} does not exist")));
    }

    if let Some(found) = scan_path_dirs(&expanded, path) {
        return CliProbe::present(found);
    }

    #[cfg(unix)]
    {
        match login_shell_lookup(&expanded) {
            ShellLookup::Found(found) => CliProbe::present(found),
            ShellLookup::NotFound => CliProbe::missing(None),
            ShellLookup::Failed => {
                CliProbe::unknown(Some(format!("Could not verify {expanded}")))
            }
        }
    }
    #[cfg(not(unix))]
    {
        CliProbe::missing(None)
    }
}

pub fn probe_cli(command: &str) -> CliProbe {
    let mut probe = resolve_cli(command);
    if probe.status != CliProbeStatus::Present {
        return probe;
    }
    if let Some(resolved) = probe.resolved_path.clone() {
        probe.version = read_cli_version(&resolved);
    }
    probe
}

fn read_cli_version(program: &str) -> Option<String> {
    let mut cmd = no_window_cmd(program);
    cmd.arg("--version")
        .env("PATH", get_expanded_path())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = cmd.spawn().ok()?;
    let reader = child.stdout.take().map(read_stream_to_string);
    let status = wait_with_timeout(&mut child, std::time::Duration::from_secs(5))?;
    if !status.success() {
        return None;
    }
    let output = reader.and_then(|r| r.join().ok()).unwrap_or_default();
    extract_version_token(&strip_ansi(&output))
}

fn extract_version_token(text: &str) -> Option<String> {
    text.split_whitespace().find_map(|token| {
        let cleaned = token.trim_matches(|c: char| !c.is_ascii_digit());
        let mut segments = cleaned.split('.');
        match (segments.next(), segments.next()) {
            (Some(major), Some(minor))
                if !major.is_empty()
                    && major.chars().all(|c| c.is_ascii_digit())
                    && !minor.is_empty()
                    && minor.chars().all(|c| c.is_ascii_digit()) =>
            {
                Some(cleaned.to_string())
            }
            _ => None,
        }
    })
}

pub fn path_with_dir_prepended(dir: &std::path::Path, path: &str) -> String {
    let mut dirs = vec![dir.to_path_buf()];
    dirs.extend(std::env::split_paths(path).filter(|p| p != dir));
    std::env::join_paths(dirs)
        .map(|joined| joined.to_string_lossy().to_string())
        .unwrap_or_else(|_| path.to_string())
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
        let resolved = resolve_cli_with_path(&command, &path);
        if resolved.status == CliProbeStatus::Missing {
            let error = match resolved.error {
                Some(detail) if detail.contains("not executable") => detail,
                _ => format!("Command not found: {}", command),
            };
            return PipelineResult {
                success: false,
                output: String::new(),
                error: Some(error),
            };
        }
        let program = resolved
            .resolved_path
            .clone()
            .unwrap_or_else(|| command.clone());
        let path = resolved
            .resolved_path
            .as_deref()
            .and_then(|p| std::path::Path::new(p).parent())
            .map(|parent| path_with_dir_prepended(parent, &path))
            .unwrap_or(path);

        let mut cmd = no_window_cmd(&program);
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
        assert_eq!(
            resolve_carriage_returns(input),
            "line one\nline two\nline three"
        );
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

    #[test]
    fn expand_tilde_swaps_home_prefix() {
        assert_eq!(
            expand_tilde_with_home("~/bin/claude", Some("/home/u")),
            "/home/u/bin/claude"
        );
        assert_eq!(expand_tilde_with_home("claude", Some("/home/u")), "claude");
        assert_eq!(
            expand_tilde_with_home("/usr/bin/claude", Some("/home/u")),
            "/usr/bin/claude"
        );
        assert_eq!(expand_tilde_with_home("~/bin/claude", None), "~/bin/claude");
    }

    #[cfg(unix)]
    fn write_executable(dir: &std::path::Path, name: &str) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let path = dir.join(name);
        std::fs::write(&path, "#!/bin/sh\nexit 0\n").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    #[cfg(unix)]
    #[test]
    fn resolve_cli_finds_command_on_provided_path() {
        let dir = tempfile::tempdir().unwrap();
        let bin = write_executable(dir.path(), "fake-cli");
        let path = dir.path().to_string_lossy().to_string();
        let probe = resolve_cli_with_path("fake-cli", &path);
        assert_eq!(probe.status, CliProbeStatus::Present);
        assert_eq!(
            probe.resolved_path,
            Some(bin.to_string_lossy().to_string())
        );
    }

    #[cfg(unix)]
    #[test]
    fn resolve_cli_absolute_non_executable_is_missing_with_detail() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("not-exec");
        std::fs::write(&file, "data").unwrap();
        let probe = resolve_cli_with_path(file.to_str().unwrap(), "");
        assert_eq!(probe.status, CliProbeStatus::Missing);
        assert!(probe.error.unwrap().contains("not executable"));
    }

    #[test]
    fn resolve_cli_absolute_miss_is_missing() {
        let probe = resolve_cli_with_path("/definitely/not/here/cli-xyz", "");
        assert_eq!(probe.status, CliProbeStatus::Missing);
        assert!(probe.resolved_path.is_none());
    }

    #[test]
    fn extract_version_token_finds_first_dotted_number() {
        assert_eq!(
            extract_version_token("1.0.35 (Claude Code)").as_deref(),
            Some("1.0.35")
        );
        assert_eq!(
            extract_version_token("codex-cli v0.4.1").as_deref(),
            Some("0.4.1")
        );
        assert_eq!(extract_version_token("no version here"), None);
    }

    #[test]
    fn path_with_dir_prepended_dedups() {
        let joined = path_with_dir_prepended(std::path::Path::new("/a/b"), "/a/b:/usr/bin");
        assert_eq!(joined, "/a/b:/usr/bin");
        let prepended = path_with_dir_prepended(std::path::Path::new("/x"), "/usr/bin");
        assert_eq!(prepended, "/x:/usr/bin");
    }
}
