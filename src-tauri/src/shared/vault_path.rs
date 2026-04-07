use std::path::Path;

pub struct VaultPathRisk {
    pub is_cloud_backed: bool,
    pub cloud_provider: Option<&'static str>,
}

pub fn analyze(path: &Path) -> VaultPathRisk {
    let path_str = path.to_string_lossy();

    if path_str.contains("Library/Mobile Documents/com~apple~CloudDocs") {
        return VaultPathRisk {
            is_cloud_backed: true,
            cloud_provider: Some("iCloud"),
        };
    }

    if path_str.contains("/Dropbox/") || path_str.contains("\\Dropbox\\") {
        return VaultPathRisk {
            is_cloud_backed: true,
            cloud_provider: Some("Dropbox"),
        };
    }

    if path_str.contains("/OneDrive/")
        || path_str.contains("\\OneDrive\\")
        || path_str.contains("/OneDrive -")
    {
        return VaultPathRisk {
            is_cloud_backed: true,
            cloud_provider: Some("OneDrive"),
        };
    }

    VaultPathRisk {
        is_cloud_backed: false,
        cloud_provider: None,
    }
}
