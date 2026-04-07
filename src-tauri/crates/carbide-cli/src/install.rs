use std::path::{Path, PathBuf};

const INSTALL_NAME: &str = "carbide";

fn home_dir() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn install_dir() -> PathBuf {
    home_dir().join(".local/bin")
}

fn install_path() -> PathBuf {
    install_dir().join(INSTALL_NAME)
}

fn current_exe_path() -> Result<PathBuf, String> {
    std::env::current_exe().map_err(|e| format!("failed to determine current executable path: {e}"))
}

pub fn install_cli() -> Result<(), String> {
    let exe = current_exe_path()?;
    let link = install_path();
    let dir = install_dir();

    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("failed to create {}: {e}", dir.display()))?;
    }

    if link.exists() || link.symlink_metadata().is_ok() {
        remove_symlink(&link)?;
    }

    create_symlink(&exe, &link)?;

    eprintln!("installed: {} -> {}", link.display(), exe.display());
    eprintln!("you can now run `carbide` from any terminal.");

    Ok(())
}

pub fn uninstall_cli() -> Result<(), String> {
    let link = install_path();

    if link.symlink_metadata().is_err() {
        eprintln!("{} does not exist, nothing to remove.", link.display());
        return Ok(());
    }

    if let Ok(target) = std::fs::read_link(&link) {
        if !is_carbide_binary(&target) {
            return Err(format!(
                "{} points to {}, which doesn't look like a Carbide binary. Refusing to remove.",
                link.display(),
                target.display()
            ));
        }
    }

    remove_symlink(&link)?;
    eprintln!("removed: {}", link.display());

    Ok(())
}

fn is_carbide_binary(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with("carbide"))
        .unwrap_or(false)
}

#[cfg(unix)]
fn create_symlink(original: &Path, link: &Path) -> Result<(), String> {
    std::os::unix::fs::symlink(original, link).map_err(|e| {
        format!(
            "failed to create symlink {} -> {}: {e}",
            link.display(),
            original.display()
        )
    })
}

#[cfg(not(unix))]
fn create_symlink(original: &Path, link: &Path) -> Result<(), String> {
    std::fs::copy(original, link).map(|_| ()).map_err(|e| {
        format!(
            "failed to copy {} -> {}: {e}",
            original.display(),
            link.display()
        )
    })
}

fn remove_symlink(link: &Path) -> Result<(), String> {
    std::fs::remove_file(link).map_err(|e| format!("failed to remove {}: {e}", link.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_path_matches_platform_default() {
        assert_eq!(install_path(), home_dir().join(".local/bin/carbide"));
    }

    #[test]
    fn is_carbide_binary_matches() {
        assert!(is_carbide_binary(Path::new("/path/to/carbide-cli")));
        assert!(is_carbide_binary(Path::new("carbide")));
        assert!(!is_carbide_binary(Path::new("/usr/bin/python3")));
        assert!(!is_carbide_binary(Path::new("")));
    }

    #[test]
    fn current_exe_returns_path() {
        let result = current_exe_path();
        assert!(result.is_ok());
    }
}
