use std::time::Instant;

const SLOW_COMMAND_MS: u128 = 250;

pub async fn blocking<T, F>(command: &'static str, f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    let started_at = Instant::now();
    let joined = tauri::async_runtime::spawn_blocking(f).await;
    let duration_ms = started_at.elapsed().as_millis();

    let result = match joined {
        Ok(result) => result,
        Err(error) => {
            log::error!(
                "command_blocking phase=join_failed command={} duration_ms={} error={}",
                command,
                duration_ms,
                error
            );
            return Err(error.to_string());
        }
    };

    if duration_ms >= SLOW_COMMAND_MS {
        log::info!(
            "command_blocking phase=slow command={} outcome={} duration_ms={}",
            command,
            if result.is_ok() { "ok" } else { "error" },
            duration_ms
        );
    }

    result
}
