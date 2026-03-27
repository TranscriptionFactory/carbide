use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

use super::registry;
use super::resolver;
use super::types::ToolchainEvent;

const TARGET_TRIPLE: &str = env!("TARGET_TRIPLE");

pub async fn download_tool(app: &AppHandle, tool_id: &str) -> Result<PathBuf, String> {
    let spec = registry::get(tool_id).ok_or_else(|| format!("Unknown tool: {}", tool_id))?;

    let platform = spec
        .platform_binaries
        .iter()
        .find(|p| p.triple == TARGET_TRIPLE)
        .ok_or_else(|| {
            format!(
                "{} has no binary for platform {}",
                spec.display_name, TARGET_TRIPLE
            )
        })?;

    let asset_name = platform.asset_template.replace("{version}", spec.version);

    let url = format!(
        "https://github.com/{}/releases/download/v{}/{}",
        spec.github_repo, spec.version, asset_name
    );

    log::info!("Downloading {} from {}", spec.display_name, url);

    emit_progress(app, tool_id, 0.0);

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed: HTTP {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Download read failed: {}", e))?;

    if total_size > 0 {
        emit_progress(app, tool_id, 50.0);
    }

    if platform.sha256 != "TODO" {
        verify_sha256(&bytes, platform.sha256)?;
    } else {
        log::warn!(
            "SHA-256 verification skipped for {} — hash not yet populated",
            spec.display_name
        );
    }

    emit_progress(app, tool_id, 75.0);

    let dest = resolver::downloaded_path(app, tool_id, spec.version, spec.binary_name)?;

    tokio::fs::create_dir_all(dest.parent().unwrap())
        .await
        .map_err(|e| format!("Failed to create toolchain directory: {}", e))?;

    extract_archive(&bytes, &asset_name, &dest, spec.binary_name).await?;

    #[cfg(unix)]
    set_executable(&dest).await?;

    emit_progress(app, tool_id, 100.0);

    let _ = app.emit(
        "toolchain_event",
        ToolchainEvent::InstallComplete {
            tool_id: tool_id.to_string(),
            version: spec.version.to_string(),
            path: dest.to_string_lossy().to_string(),
        },
    );

    log::info!(
        "{} v{} installed to {}",
        spec.display_name,
        spec.version,
        dest.display()
    );

    Ok(dest)
}

fn emit_progress(app: &AppHandle, tool_id: &str, percent: f32) {
    let _ = app.emit(
        "toolchain_event",
        ToolchainEvent::DownloadProgress {
            tool_id: tool_id.to_string(),
            percent,
        },
    );
}

fn verify_sha256(data: &[u8], expected: &str) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    let hash = Sha256::digest(data);
    let hex = format!("{:x}", hash);
    if hex != expected {
        return Err(format!(
            "SHA256 mismatch: expected {}, got {}",
            expected, hex
        ));
    }
    Ok(())
}

async fn extract_archive(
    data: &[u8],
    asset_name: &str,
    dest: &PathBuf,
    binary_name: &str,
) -> Result<(), String> {
    let bin_filename = if cfg!(target_os = "windows") {
        format!("{}.exe", binary_name)
    } else {
        binary_name.to_string()
    };

    if asset_name.ends_with(".tar.gz") || asset_name.ends_with(".tgz") {
        extract_tar_gz(data, dest, &bin_filename)?;
    } else if asset_name.ends_with(".zip") {
        extract_zip(data, dest, &bin_filename)?;
    } else {
        let mut file = tokio::fs::File::create(dest)
            .await
            .map_err(|e| format!("Failed to write binary: {}", e))?;
        file.write_all(data)
            .await
            .map_err(|e| format!("Failed to write binary: {}", e))?;
    }

    Ok(())
}

fn extract_tar_gz(data: &[u8], dest: &PathBuf, bin_filename: &str) -> Result<(), String> {
    use std::io::Read;

    let gz = flate2::read::GzDecoder::new(data);
    let mut archive = tar::Archive::new(gz);

    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path().map_err(|e| e.to_string())?;
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

        if name == bin_filename {
            let mut contents = Vec::new();
            entry
                .read_to_end(&mut contents)
                .map_err(|e| e.to_string())?;
            std::fs::write(dest, &contents).map_err(|e| e.to_string())?;
            return Ok(());
        }
    }

    Err(format!("Binary '{}' not found in archive", bin_filename))
}

fn extract_zip(data: &[u8], dest: &PathBuf, bin_filename: &str) -> Result<(), String> {
    use std::io::Read;

    let cursor = std::io::Cursor::new(data);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file
            .enclosed_name()
            .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
            .unwrap_or_default();

        if name == bin_filename {
            let mut contents = Vec::new();
            file.read_to_end(&mut contents).map_err(|e| e.to_string())?;
            std::fs::write(dest, &contents).map_err(|e| e.to_string())?;
            return Ok(());
        }
    }

    Err(format!(
        "Binary '{}' not found in zip archive",
        bin_filename
    ))
}

#[cfg(unix)]
async fn set_executable(path: &PathBuf) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let perms = std::fs::Permissions::from_mode(0o755);
    tokio::fs::set_permissions(path, perms)
        .await
        .map_err(|e| format!("Failed to set executable permission: {}", e))
}
