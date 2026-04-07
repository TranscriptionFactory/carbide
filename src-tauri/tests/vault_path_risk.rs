use std::path::Path;

use crate::shared::vault_path::analyze;

#[test]
fn detects_icloud_path() {
    let path = Path::new("/Users/alice/Library/Mobile Documents/com~apple~CloudDocs/vaults/notes");
    let risk = analyze(path);
    assert!(risk.is_cloud_backed);
    assert_eq!(risk.cloud_provider, Some("iCloud"));
}

#[test]
fn detects_dropbox_path() {
    let path = Path::new("/Users/alice/Dropbox/vaults/notes");
    let risk = analyze(path);
    assert!(risk.is_cloud_backed);
    assert_eq!(risk.cloud_provider, Some("Dropbox"));
}

#[test]
fn detects_onedrive_path() {
    let path = Path::new("/Users/alice/OneDrive/Documents/notes");
    let risk = analyze(path);
    assert!(risk.is_cloud_backed);
    assert_eq!(risk.cloud_provider, Some("OneDrive"));
}

#[test]
fn detects_onedrive_business_path() {
    let path = Path::new("/Users/alice/OneDrive - Company Inc/notes");
    let risk = analyze(path);
    assert!(risk.is_cloud_backed);
    assert_eq!(risk.cloud_provider, Some("OneDrive"));
}

#[test]
fn local_path_has_no_risk() {
    let path = Path::new("/Users/alice/Documents/vaults/notes");
    let risk = analyze(path);
    assert!(!risk.is_cloud_backed);
    assert_eq!(risk.cloud_provider, None);
}

#[test]
fn empty_path_has_no_risk() {
    let path = Path::new("");
    let risk = analyze(path);
    assert!(!risk.is_cloud_backed);
}
