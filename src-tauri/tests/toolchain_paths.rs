use crate::features::toolchain::resolver::{
    downloaded_path_in, remove_tool_downloads, tool_dir_in,
};
use std::path::Path;

const APP_DATA: &str = "/home/user/.local/share/carbide";

fn install_fake_binary(app_data: &Path, tool_id: &str, version: &str, binary_name: &str) {
    let path = downloaded_path_in(app_data, tool_id, version, binary_name);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, b"fake binary").unwrap();
}

#[tokio::test]
async fn uninstall_removes_versions_left_behind_by_an_earlier_pin() {
    let tmp = tempfile::tempdir().unwrap();
    let app_data = tmp.path();

    install_fake_binary(app_data, "rumdl", "0.1.59", "rumdl");
    install_fake_binary(app_data, "rumdl", "0.2.55", "rumdl");

    remove_tool_downloads(app_data, "rumdl").await.unwrap();

    let stale = downloaded_path_in(app_data, "rumdl", "0.1.59", "rumdl");
    let current = downloaded_path_in(app_data, "rumdl", "0.2.55", "rumdl");

    assert!(
        !current.exists(),
        "uninstall left the current pin's binary at {}",
        current.display()
    );
    assert!(
        !stale.exists(),
        "uninstall left {} on disk — a version installed before a pin bump must \
         still be removed, or the tool stays on disk while the UI says NotInstalled",
        stale.display()
    );
    assert!(!tool_dir_in(app_data, "rumdl").exists());
}

#[tokio::test]
async fn uninstall_does_not_touch_other_tools() {
    let tmp = tempfile::tempdir().unwrap();
    let app_data = tmp.path();

    install_fake_binary(app_data, "rumdl", "0.2.55", "rumdl");
    install_fake_binary(app_data, "marksman", "2026-02-08", "marksman");

    remove_tool_downloads(app_data, "rumdl").await.unwrap();

    let marksman = downloaded_path_in(app_data, "marksman", "2026-02-08", "marksman");
    assert!(
        marksman.exists(),
        "uninstalling rumdl also deleted {}",
        marksman.display()
    );
}

#[tokio::test]
async fn uninstall_is_idempotent_when_nothing_is_installed() {
    let tmp = tempfile::tempdir().unwrap();
    remove_tool_downloads(tmp.path(), "rumdl").await.unwrap();
    remove_tool_downloads(tmp.path(), "rumdl").await.unwrap();
}

#[test]
fn uninstall_target_covers_a_version_other_than_the_current_pin() {
    let app_data = Path::new(APP_DATA);
    let stale = downloaded_path_in(app_data, "rumdl", "0.1.59", "rumdl");
    let uninstall_target = tool_dir_in(app_data, "rumdl");

    assert!(
        stale.starts_with(&uninstall_target),
        "uninstall removes {}, which does not contain the binary installed by an \
         earlier pin at {} — bumping a pin would strand the old copy on disk",
        uninstall_target.display(),
        stale.display()
    );
}

#[test]
fn uninstall_target_covers_every_version_dir() {
    let app_data = Path::new(APP_DATA);
    let uninstall_target = tool_dir_in(app_data, "iwes");

    for version in ["0.0.67", "0.19.1", "2026-02-08"] {
        let installed = downloaded_path_in(app_data, "iwes", version, "iwes");
        assert!(
            installed.starts_with(&uninstall_target),
            "version {} installs to {}, outside the uninstall target {}",
            version,
            installed.display(),
            uninstall_target.display()
        );
    }
}

#[test]
fn each_version_gets_its_own_directory() {
    let app_data = Path::new(APP_DATA);
    let old = downloaded_path_in(app_data, "rumdl", "0.1.59", "rumdl");
    let new = downloaded_path_in(app_data, "rumdl", "0.2.55", "rumdl");

    assert_ne!(old, new, "two pins must not share an install path");
}

#[test]
fn uninstall_target_is_scoped_to_one_tool() {
    let app_data = Path::new(APP_DATA);
    let rumdl_dir = tool_dir_in(app_data, "rumdl");
    let marksman = downloaded_path_in(app_data, "marksman", "2026-02-08", "marksman");

    assert!(
        !marksman.starts_with(&rumdl_dir),
        "uninstalling rumdl would delete {} — the removal must not reach a sibling tool",
        marksman.display()
    );
}
