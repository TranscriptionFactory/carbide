use crate::shared::lsp_client::{is_retryable, LspClientError};

#[test]
fn display_init_timeout_with_stderr() {
    let err = LspClientError::InitTimeout {
        stderr_excerpt: "error: index corrupted\npanic at main.rs:42".to_string(),
    };
    let msg = err.to_string();
    assert!(msg.contains("LSP init timed out"));
    assert!(msg.contains("index corrupted"));
    assert!(msg.contains("panic at main.rs:42"));
}

#[test]
fn display_init_timeout_empty_stderr() {
    let err = LspClientError::InitTimeout {
        stderr_excerpt: String::new(),
    };
    let msg = err.to_string();
    assert_eq!(msg, "LSP init timed out");
    assert!(!msg.contains("stderr"));
}

#[test]
fn display_init_eof_with_stderr() {
    let err = LspClientError::InitEof {
        stderr_excerpt: "segfault".to_string(),
    };
    let msg = err.to_string();
    assert!(msg.contains("LSP process exited during init"));
    assert!(msg.contains("segfault"));
}

#[test]
fn display_init_failed_with_stderr() {
    let err = LspClientError::InitFailed {
        message: "capability mismatch".to_string(),
        stderr_excerpt: "warn: unsupported feature".to_string(),
    };
    let msg = err.to_string();
    assert!(msg.contains("LSP init failed: capability mismatch"));
    assert!(msg.contains("unsupported feature"));
}

#[test]
fn retryable_process_spawn_failed() {
    assert!(is_retryable(&LspClientError::ProcessSpawnFailed(
        "ENOENT".into()
    )));
}

#[test]
fn retryable_init_eof() {
    assert!(is_retryable(&LspClientError::InitEof {
        stderr_excerpt: String::new(),
    }));
}

#[test]
fn retryable_process_exited() {
    assert!(is_retryable(&LspClientError::ProcessExited));
}

#[test]
fn not_retryable_init_timeout() {
    assert!(!is_retryable(&LspClientError::InitTimeout {
        stderr_excerpt: String::new(),
    }));
}

#[test]
fn not_retryable_init_failed() {
    assert!(!is_retryable(&LspClientError::InitFailed {
        message: "rejected".into(),
        stderr_excerpt: String::new(),
    }));
}

#[test]
fn not_retryable_request_timeout() {
    assert!(!is_retryable(&LspClientError::RequestTimeout));
}

#[test]
fn not_retryable_channel_closed() {
    assert!(!is_retryable(&LspClientError::ChannelClosed));
}

#[test]
fn display_process_spawn_failed() {
    let err = LspClientError::ProcessSpawnFailed("ENOENT: no such file".to_string());
    let msg = err.to_string();
    assert_eq!(msg, "LSP process spawn failed: ENOENT: no such file");
}

#[test]
fn display_process_exited() {
    let err = LspClientError::ProcessExited;
    assert_eq!(err.to_string(), "LSP process exited unexpectedly");
}

#[test]
fn display_request_timeout() {
    let err = LspClientError::RequestTimeout;
    assert_eq!(err.to_string(), "LSP request timed out");
}

#[test]
fn display_shutdown_failed() {
    let err = LspClientError::ShutdownFailed("transport error".to_string());
    assert_eq!(err.to_string(), "LSP shutdown failed: transport error");
}

#[test]
fn display_channel_closed() {
    let err = LspClientError::ChannelClosed;
    assert_eq!(err.to_string(), "LSP client channel closed");
}

#[test]
fn display_invalid_response() {
    let err = LspClientError::InvalidResponse("missing id field".to_string());
    assert_eq!(err.to_string(), "LSP invalid response: missing id field");
}

#[test]
fn display_init_eof_empty_stderr() {
    let err = LspClientError::InitEof {
        stderr_excerpt: String::new(),
    };
    let msg = err.to_string();
    assert_eq!(msg, "LSP process exited during init");
    assert!(!msg.contains("stderr"));
}

#[test]
fn display_init_failed_empty_stderr() {
    let err = LspClientError::InitFailed {
        message: "rejected".to_string(),
        stderr_excerpt: String::new(),
    };
    let msg = err.to_string();
    assert_eq!(msg, "LSP init failed: rejected");
    assert!(!msg.contains("stderr"));
}
