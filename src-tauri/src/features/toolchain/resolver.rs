use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

use super::registry;

pub async fn resolve(
    app: &AppHandle,
    tool_id: &str,
    custom_path: Option<&str>,
) -> Result<PathBuf, String> {
    if let Some(path) = custom_path {
        let p = PathBuf::from(path);
        if p.exists() {
            return Ok(p);
        }
        return Err(format!(
            "Custom binary path does not exist: {}",
            p.display()
        ));
    }

    let spec = registry::get(tool_id)
        .ok_or_else(|| format!("Unknown tool: {}", tool_id))?;

    if let Some(sidecar) = sidecar_path(app, spec.binary_name) {
        return Ok(sidecar);
    }

    let downloaded = downloaded_path(app, tool_id, spec.version, spec.binary_name)?;
    if downloaded.exists() {
        return Ok(downloaded);
    }

    if let Ok(found) = which(spec.binary_name) {
        return Ok(found);
    }

    Err(format!(
        "{} not found — install via Settings > Tools or place on PATH",
        spec.display_name
    ))
}

fn sidecar_path(app: &AppHandle, binary_name: &str) -> Option<PathBuf> {
    let bin = if cfg!(target_os = "windows") {
        format!("{}.exe", binary_name)
    } else {
        binary_name.to_string()
    };
    let path = app
        .path()
        .resource_dir()
        .ok()?
        .join("binaries")
        .join(&bin);
    if path.exists() { Some(path) } else { None }
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
