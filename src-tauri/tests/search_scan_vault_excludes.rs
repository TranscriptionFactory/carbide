use crate::features::search::db::scan_vault;
use std::fs;
use std::path::{Path, PathBuf};
use tempfile::TempDir;

fn write_file(dir: &Path, rel: &str, content: &str) {
    let path = dir.join(rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("parent dir should be created");
    }
    fs::write(&path, content).expect("file should be written");
}

fn relative_to(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .expect("path should be under vault root")
        .to_string_lossy()
        .replace('\\', "/")
}

fn scan(root: &Path) -> Vec<String> {
    scan_vault(None, "vault", root)
        .expect("scan should succeed")
        .indexable_files
        .iter()
        .map(|p| relative_to(root, p))
        .collect()
}

fn seeded_vault() -> TempDir {
    let dir = TempDir::new().expect("temp dir should be created");
    write_file(dir.path(), "note.md", "# Note\n\nbody\n");
    write_file(dir.path(), ".gitignore", "target/\n");
    write_file(dir.path(), ".hidden.md", "# Hidden\n");
    write_file(dir.path(), "mcp.json", "{}\n");
    write_file(dir.path(), "nested/mcp.json", "{}\n");
    write_file(dir.path(), "nested/paper.md", "# Paper\n");
    dir
}

#[test]
fn scan_vault_omits_dotfiles() {
    let dir = seeded_vault();
    let files = scan(dir.path());

    assert!(
        !files.iter().any(|p| p == ".gitignore"),
        "dotfile should not be indexable, got {files:?}"
    );
    assert!(
        !files.iter().any(|p| p == ".hidden.md"),
        "hidden markdown should not be indexable, got {files:?}"
    );
}

#[test]
fn scan_vault_omits_mcp_config() {
    let dir = seeded_vault();
    let files = scan(dir.path());

    assert!(
        !files.iter().any(|p| p == "mcp.json"),
        "mcp.json should not be indexable, got {files:?}"
    );
    assert!(
        !files.iter().any(|p| p == "nested/mcp.json"),
        "nested mcp.json should not be indexable, got {files:?}"
    );
}

#[test]
fn scan_vault_keeps_ordinary_notes() {
    let dir = seeded_vault();
    let files = scan(dir.path());

    assert_eq!(files, vec!["nested/paper.md", "note.md"]);
}

#[test]
fn scan_vault_counts_only_visible_notes() {
    let dir = seeded_vault();
    let stats = scan_vault(None, "vault", dir.path())
        .expect("scan should succeed")
        .stats;

    assert_eq!(stats.note_count, 2);
    assert_eq!(stats.folder_count, 1);
}

#[test]
fn removed_dotfiles_are_pruned_by_sync_plan() {
    use crate::features::search::db::compute_sync_plan;
    use std::collections::BTreeMap;

    let dir = seeded_vault();
    let manifest: BTreeMap<String, (i64, i64)> = [
        (".gitignore".to_string(), (1, 1)),
        ("mcp.json".to_string(), (1, 1)),
        ("note.md".to_string(), (1, 1)),
    ]
    .into_iter()
    .collect();

    let disk_files: Vec<PathBuf> = scan_vault(None, "vault", dir.path())
        .expect("scan should succeed")
        .indexable_files;
    let plan = compute_sync_plan(dir.path(), &manifest, &disk_files);

    assert_eq!(plan.removed, vec![".gitignore", "mcp.json"]);
}

#[test]
fn is_indexable_rejects_dotfiles_and_ignored_paths() {
    use crate::features::search::db::is_indexable;
    use crate::shared::vault_ignore;

    let dir = seeded_vault();
    let root = dir.path();
    let matcher = vault_ignore::builtin_matcher().expect("matcher should build");

    assert!(!is_indexable(root, &root.join(".hidden.md"), &matcher));
    assert!(!is_indexable(root, &root.join(".gitignore"), &matcher));
    assert!(!is_indexable(root, &root.join("mcp.json"), &matcher));
    assert!(!is_indexable(root, &root.join("nested/mcp.json"), &matcher));
}

#[test]
fn is_indexable_keeps_ordinary_notes() {
    use crate::features::search::db::is_indexable;
    use crate::shared::vault_ignore;

    let dir = seeded_vault();
    let root = dir.path();
    let matcher = vault_ignore::builtin_matcher().expect("matcher should build");

    assert!(is_indexable(root, &root.join("note.md"), &matcher));
    assert!(is_indexable(root, &root.join("nested/paper.md"), &matcher));
}

#[test]
fn is_indexable_agrees_with_scan_vault() {
    use crate::features::search::db::is_indexable;
    use crate::shared::vault_ignore;

    let dir = seeded_vault();
    let root = dir.path();
    let matcher = vault_ignore::builtin_matcher().expect("matcher should build");

    let scanned = scan(root);
    for candidate in [
        "note.md",
        "nested/paper.md",
        ".gitignore",
        ".hidden.md",
        "mcp.json",
        "nested/mcp.json",
    ] {
        assert_eq!(
            is_indexable(root, &root.join(candidate), &matcher),
            scanned.iter().any(|p| p == candidate),
            "{candidate} should be classified the same by both paths"
        );
    }
}

#[test]
#[should_panic(expected = "path should be under vault root")]
fn relative_to_panics_outside_the_vault_root() {
    let vault = seeded_vault();
    let elsewhere = TempDir::new().expect("temp dir should be created");

    relative_to(vault.path(), &elsewhere.path().join("note.md"));
}
