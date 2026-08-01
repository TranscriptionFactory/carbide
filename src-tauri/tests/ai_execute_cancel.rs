#![cfg(unix)]

use crate::features::ai::service::{
    execute_cli, AiExecState, AiProviderConfig, AiTransport,
};
use crate::features::pipeline::service as pipeline;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const NOTE_PATH: &str = "note.md";

fn cli_provider(args: &[&str]) -> AiProviderConfig {
    AiProviderConfig {
        id: "test".to_string(),
        name: "Test".to_string(),
        transport: AiTransport::Cli {
            command: "sh".to_string(),
            args: args.iter().map(|a| a.to_string()).collect(),
        },
        model: None,
        install_url: None,
        is_preset: None,
    }
}

// `exec` makes the recorded pid the process we actually kill rather than a shell
// that would leave the sleep orphaned.
fn pid_recording_sleep(pid_file: &Path) -> AiProviderConfig {
    cli_provider(&[
        "-c",
        &format!("echo $$ > {}; exec sleep 30", pid_file.display()),
    ])
}

fn is_alive(pid: u32) -> bool {
    std::process::Command::new("kill")
        .arg("-0")
        .arg(pid.to_string())
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

async fn poll_until(deadline: Duration, mut ready: impl FnMut() -> bool) -> bool {
    let start = Instant::now();
    while start.elapsed() < deadline {
        if ready() {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    ready()
}

async fn read_pid(pid_file: &PathBuf) -> u32 {
    let found = poll_until(Duration::from_secs(10), || {
        std::fs::read_to_string(pid_file)
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false)
    })
    .await;
    assert!(found, "child never wrote its pid");
    std::fs::read_to_string(pid_file)
        .unwrap()
        .trim()
        .parse()
        .expect("pid file should hold a pid")
}

#[tokio::test]
async fn abort_mid_execute_kills_the_child_and_reports_aborted() {
    let vault = tempfile::tempdir().unwrap();
    let pid_file = vault.path().join("child.pid");
    let state = std::sync::Arc::new(AiExecState::default());

    let run = tokio::spawn({
        let state = std::sync::Arc::clone(&state);
        let provider = pid_recording_sleep(&pid_file);
        let vault_path = vault.path().to_string_lossy().to_string();
        async move {
            execute_cli(
                &state,
                provider,
                vault_path,
                NOTE_PATH.to_string(),
                "prompt".to_string(),
                Some(300),
                Some("run-1".to_string()),
            )
            .await
        }
    });

    let pid = read_pid(&pid_file).await;
    assert!(is_alive(pid), "child should be running before abort");

    let started = Instant::now();
    state.abort("run-1").await;
    let result = run.await.unwrap().unwrap();

    assert!(
        started.elapsed() < Duration::from_secs(5),
        "abort should return promptly, took {:?}",
        started.elapsed()
    );
    assert!(
        !result.success,
        "abort should not report success, output: {:?}",
        result.output
    );
    assert_eq!(result.error.as_deref(), Some(pipeline::ABORTED_ERROR));
    assert!(
        poll_until(Duration::from_secs(2), || !is_alive(pid)).await,
        "child pid {pid} still alive after abort"
    );
    assert_eq!(state.active_count().await, 0);
}

#[tokio::test]
async fn abort_with_unknown_request_id_is_silently_ignored() {
    let state = AiExecState::default();

    state.abort("never-registered").await;

    assert_eq!(state.active_count().await, 0);
}

#[tokio::test]
async fn absent_request_id_registers_nothing_and_still_runs() {
    let vault = tempfile::tempdir().unwrap();
    let state = AiExecState::default();

    let result = execute_cli(
        &state,
        cli_provider(&["-c", "echo hello"]),
        vault.path().to_string_lossy().to_string(),
        NOTE_PATH.to_string(),
        "prompt".to_string(),
        Some(30),
        None,
    )
    .await
    .unwrap();

    assert!(result.success, "unexpected failure: {:?}", result.error);
    assert_eq!(result.output, "hello");
    assert_eq!(state.active_count().await, 0);
}

#[tokio::test]
async fn normal_completion_releases_the_handle() {
    let vault = tempfile::tempdir().unwrap();
    let state = AiExecState::default();

    let result = execute_cli(
        &state,
        cli_provider(&["-c", "echo hello"]),
        vault.path().to_string_lossy().to_string(),
        NOTE_PATH.to_string(),
        "prompt".to_string(),
        Some(30),
        Some("run-1".to_string()),
    )
    .await
    .unwrap();

    assert!(result.success, "unexpected failure: {:?}", result.error);
    assert_eq!(result.output, "hello");
    assert_eq!(state.active_count().await, 0);
}

#[tokio::test]
async fn failing_command_releases_the_handle() {
    let vault = tempfile::tempdir().unwrap();
    let state = AiExecState::default();

    let result = execute_cli(
        &state,
        cli_provider(&["-c", "echo boom >&2; exit 3"]),
        vault.path().to_string_lossy().to_string(),
        NOTE_PATH.to_string(),
        "prompt".to_string(),
        Some(30),
        Some("run-1".to_string()),
    )
    .await
    .unwrap();

    assert!(
        !result.success,
        "exit 3 should not report success, output: {:?}",
        result.output
    );
    assert_eq!(result.error.as_deref(), Some("boom"));
    assert_eq!(state.active_count().await, 0);
}

#[tokio::test]
async fn abort_after_completion_is_a_no_op() {
    let vault = tempfile::tempdir().unwrap();
    let state = AiExecState::default();

    execute_cli(
        &state,
        cli_provider(&["-c", "echo hello"]),
        vault.path().to_string_lossy().to_string(),
        NOTE_PATH.to_string(),
        "prompt".to_string(),
        Some(30),
        Some("run-1".to_string()),
    )
    .await
    .unwrap();

    state.abort("run-1").await;

    assert_eq!(state.active_count().await, 0);
}

#[tokio::test]
async fn aborting_one_run_leaves_a_concurrent_run_untouched() {
    let vault = tempfile::tempdir().unwrap();
    let doomed_pid_file = vault.path().join("doomed.pid");
    let survivor_pid_file = vault.path().join("survivor.pid");
    let state = std::sync::Arc::new(AiExecState::default());
    let vault_path = vault.path().to_string_lossy().to_string();

    let spawn_run = |id: &'static str, provider: AiProviderConfig| {
        let state = std::sync::Arc::clone(&state);
        let vault_path = vault_path.clone();
        tokio::spawn(async move {
            execute_cli(
                &state,
                provider,
                vault_path,
                NOTE_PATH.to_string(),
                "prompt".to_string(),
                Some(300),
                Some(id.to_string()),
            )
            .await
        })
    };

    let doomed = spawn_run("doomed", pid_recording_sleep(&doomed_pid_file));
    let survivor = spawn_run("survivor", pid_recording_sleep(&survivor_pid_file));

    let doomed_pid = read_pid(&doomed_pid_file).await;
    let survivor_pid = read_pid(&survivor_pid_file).await;

    state.abort("doomed").await;
    let doomed_result = doomed.await.unwrap().unwrap();

    assert_eq!(doomed_result.error.as_deref(), Some(pipeline::ABORTED_ERROR));
    assert!(
        poll_until(Duration::from_secs(2), || !is_alive(doomed_pid)).await,
        "aborted child should be dead"
    );
    assert!(
        is_alive(survivor_pid),
        "unrelated run must survive an abort aimed at another id"
    );
    assert_eq!(state.active_count().await, 1);

    state.abort("survivor").await;
    survivor.await.unwrap().unwrap();
    assert_eq!(state.active_count().await, 0);
}

#[tokio::test]
async fn timeout_is_still_reported_as_a_timeout_and_kills_the_child() {
    let dir = tempfile::tempdir().unwrap();
    let pid_file = dir.path().join("child.pid");

    let started = Instant::now();
    let result = pipeline::execute_pipeline(
        "sh".to_string(),
        vec![
            "-c".to_string(),
            format!("echo $$ > {}; exec sleep 30", pid_file.display()),
        ],
        None,
        dir.path().to_string_lossy().to_string(),
        Some(1),
        None,
        None,
    )
    .await
    .unwrap();

    assert!(
        !result.success,
        "timeout should not report success, output: {:?}",
        result.output
    );
    assert_eq!(result.error.as_deref(), Some(pipeline::TIMED_OUT_ERROR));
    // Regression guard for the shared-child lock fix: the child sleeps 30 s, so a
    // timeout that waits on the child instead of killing it would land near 30 s.
    assert!(
        started.elapsed() < Duration::from_secs(3),
        "timeout should fire at the 1 s deadline, took {:?}",
        started.elapsed()
    );

    let pid: u32 = std::fs::read_to_string(&pid_file)
        .unwrap()
        .trim()
        .parse()
        .unwrap();
    assert!(
        poll_until(Duration::from_secs(2), || !is_alive(pid)).await,
        "timed-out child pid {pid} still alive"
    );
}

#[tokio::test]
async fn pipeline_without_abort_channel_still_succeeds() {
    let dir = tempfile::tempdir().unwrap();

    let result = pipeline::execute_pipeline(
        "sh".to_string(),
        vec!["-c".to_string(), "echo hello".to_string()],
        None,
        dir.path().to_string_lossy().to_string(),
        Some(30),
        None,
        None,
    )
    .await
    .unwrap();

    assert!(result.success, "unexpected failure: {:?}", result.error);
    assert_eq!(result.output, "hello");
}
