use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;

/// Atomically writes content to a file by writing to a temporary file first,
/// syncing it to disk, and then renaming it to the target path.
pub fn atomic_write<P: AsRef<Path>, C: AsRef<[u8]>>(path: P, content: C) -> Result<(), String> {
    let path = path.as_ref();
    let dir = path
        .parent()
        .ok_or_else(|| format!("Invalid path: {}", path.display()))?;

    // Ensure parent directory exists
    std::fs::create_dir_all(dir).map_err(|e| {
        log::error!("Failed to create directory {}: {}", dir.display(), e);
        e.to_string()
    })?;

    // Create a temporary file in the same directory
    // Using a simple .tmp extension as per the plan
    let file_name = path
        .file_name()
        .ok_or_else(|| format!("Invalid file name: {}", path.display()))?;
    let mut tmp_file_name = file_name.to_os_string();
    tmp_file_name.push(".tmp");
    let tmp_path = dir.join(tmp_file_name);

    let mut tmp_file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&tmp_path)
        .map_err(|e| {
            log::error!("Failed to open temp file {}: {}", tmp_path.display(), e);
            e.to_string()
        })?;

    // Write content
    tmp_file.write_all(content.as_ref()).map_err(|e| {
        log::error!("Failed to write to temp file {}: {}", tmp_path.display(), e);
        e.to_string()
    })?;

    // Sync to disk to ensure data is actually written
    tmp_file.sync_all().map_err(|e| {
        log::error!("Failed to sync temp file {}: {}", tmp_path.display(), e);
        e.to_string()
    })?;

    // Atomic rename to replace the target file.
    // On iCloud Drive the parent directory can be evicted between create_dir_all
    // and rename, so retry once after re-creating the parent on NotFound.
    if let Err(e) = std::fs::rename(&tmp_path, path) {
        if e.kind() == std::io::ErrorKind::NotFound {
            log::warn!(
                "Rename {} -> {} failed with NotFound, retrying after mkdir",
                tmp_path.display(),
                path.display(),
            );
            let _ = std::fs::create_dir_all(dir);
            std::fs::rename(&tmp_path, path).map_err(|e2| {
                log::error!(
                    "Retry rename {} -> {} failed: {}",
                    tmp_path.display(),
                    path.display(),
                    e2
                );
                let _ = std::fs::remove_file(&tmp_path);
                e2.to_string()
            })?;
        } else {
            log::error!(
                "Failed to rename {} -> {}: {}",
                tmp_path.display(),
                path.display(),
                e
            );
            let _ = std::fs::remove_file(&tmp_path);
            return Err(e.to_string());
        }
    }

    Ok(())
}

/// Reads a file into a UTF-8 string, detecting the encoding and converting it if necessary.
pub fn read_file_to_string<P: AsRef<Path>>(path: P) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;

    if bytes.is_empty() {
        return Ok(String::new());
    }

    // Use chardetng to guess the encoding
    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(&bytes, true);
    let encoding = detector.guess(None, true);

    // Decode to UTF-8
    let (decoded, _, _) = encoding.decode(&bytes);
    Ok(decoded.to_string())
}
