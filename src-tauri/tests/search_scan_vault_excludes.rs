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

fn scan(root: &Path) -> Vec<String> {
    scan_vault(None, "vault", root)
        .expect("scan should succeed")
        .indexable_files
        .iter()
        .map(|p| {
            p.strip_prefix(root)
                .unwrap_or(p.as_path())
                .to_string_lossy()
                .replace('\\', "/")
        })
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
