use std::path::{Path, PathBuf};

const SYMLINK_NAME: &str = "carbide";

fn symlink_dir() -> PathBuf {
    PathBuf::from("/usr/local/bin")
}

fn symlink_path() -> PathBuf {
    symlink_dir().join(SYMLINK_NAME)
}

fn current_exe_path() -> Result<PathBuf, String> {
    std::env::current_exe().map_err(|e| format!("failed to determine current executable path: {e}"))
}

pub fn install_cli() -> Result<(), String> {
    let exe = current_exe_path()?;
    let link = symlink_path();
    let dir = symlink_dir();

    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("failed to create {}: {e} (try with sudo)", dir.display()))?;
    }

    if link.exists() || link.symlink_metadata().is_ok() {
        remove_symlink(&link)?;
    }

    create_symlink(&exe, &link)?;

    eprintln!(
        "installed: {} -> {}",
        link.display(),
        exe.display()
    );
    eprintln!("you can now run `carbide` from any terminal.");

    Ok(())
}

pub fn uninstall_cli() -> Result<(), String> {
    let link = symlink_path();

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
            "failed to create symlink {} -> {}: {e} (try with sudo)",
            link.display(),
            original.display()
        )
    })
}

#[cfg(not(unix))]
fn create_symlink(original: &Path, link: &Path) -> Result<(), String> {
    std::fs::copy(original, link)
        .map(|_| ())
        .map_err(|e| format!("failed to copy {} -> {}: {e}", original.display(), link.display()))
}

fn remove_symlink(link: &Path) -> Result<(), String> {
    std::fs::remove_file(link).map_err(|e| {
        format!(
            "failed to remove {}: {e} (try with sudo)",
            link.display()
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn symlink_path_is_in_usr_local_bin() {
        assert_eq!(symlink_path(), PathBuf::from("/usr/local/bin/carbide"));
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
