use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;

use super::registry;

const TARGET_TRIPLE: &str = env!("TARGET_TRIPLE");

pub async fn resolve(
    app: &AppHandle,
    tool_id: &str,
    custom_path: Option<&str>,
) -> Result<PathBuf, String> {
    if let Some(path) = custom_path {
        let p = PathBuf::from(path);
        if p.exists() {
            return Ok(ready(p));
        }
        return Err(format!(
            "Custom binary path does not exist: {}",
            p.display()
        ));
    }

    let spec = registry::get(tool_id).ok_or_else(|| format!("Unknown tool: {}", tool_id))?;

    if let Some(sidecar) = sidecar_path(app, spec.binary_name) {
        return Ok(ready(sidecar));
    }

    let downloaded = downloaded_path(app, tool_id, spec.version, spec.binary_name)?;
    if downloaded.exists() {
        return Ok(ready(downloaded));
    }

    if let Ok(found) = which(spec.binary_name) {
        return Ok(ready(found));
    }

    if spec.downloadable() {
        log::info!(
            "{} not found locally, attempting auto-download",
            spec.display_name
        );
        return super::downloader::download_tool(app, tool_id).await.map(ready);
    }

    Err(format!(
        "{} not found — install via Settings > Tools or place on PATH",
        spec.display_name
    ))
}

fn ready(path: PathBuf) -> PathBuf {
    ensure_macos_executable(&path);
    path
}

#[cfg(target_os = "macos")]
fn ensure_macos_executable(path: &Path) {
    let _ = std::process::Command::new("xattr")
        .args(["-d", "com.apple.quarantine"])
        .arg(path)
        .output();

    let _ = std::process::Command::new("codesign")
        .args(["--force", "--sign", "-"])
        .arg(path)
        .output();
}

#[cfg(not(target_os = "macos"))]
fn ensure_macos_executable(_path: &Path) {}

fn sidecar_path(app: &AppHandle, binary_name: &str) -> Option<PathBuf> {
    let (with_triple, without_triple) = if cfg!(target_os = "windows") {
        (
            format!("{}-{}.exe", binary_name, TARGET_TRIPLE),
            format!("{}.exe", binary_name),
        )
    } else {
        (
            format!("{}-{}", binary_name, TARGET_TRIPLE),
            binary_name.to_string(),
        )
    };

    let candidates = [&with_triple, &without_triple];

    let dirs: Vec<PathBuf> = [
        // Bundled app: externalBin sits next to the main executable
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.join("binaries"))),
        // Bundled app: resource_dir (fallback)
        app.path().resource_dir().ok().map(|d| d.join("binaries")),
        // Dev mode: source directory
        Some(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries")),
    ]
    .into_iter()
    .flatten()
    .collect();

    for dir in &dirs {
        for name in &candidates {
            let path = dir.join(name);
            if path.exists() {
                return Some(path);
            }
        }
    }
    None
}

pub fn downloaded_path(
    app: &AppHandle,
    tool_id: &str,
    version: &str,
    binary_name: &str,
) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot determine app data directory: {}", e))?;
    let bin = if cfg!(target_os = "windows") {
        format!("{}.exe", binary_name)
    } else {
        binary_name.to_string()
    };
    Ok(app_data
        .join("toolchain")
        .join(tool_id)
        .join(version)
        .join(bin))
}

fn which(name: &str) -> Result<PathBuf, String> {
    let cmd = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };
    let output = std::process::Command::new(cmd)
        .arg(name)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let path = stdout.lines().next().unwrap_or("").trim().to_string();
        if !path.is_empty() {
            return Ok(PathBuf::from(path));
        }
    }
    Err(format!("{} not found on PATH", name))
}
